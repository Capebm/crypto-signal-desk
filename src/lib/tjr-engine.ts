import type { Action, Decision } from './decision-engine'
import { riskProfiles, tjrGates, type RiskProfile } from './risk-profile'
import { latestSessionLevels, previousDayLevels } from './sessions'
import {
  activeFairValueGap,
  priceInDiscount,
  priceInPremium,
  priceTouchesZone,
  smtDivergence,
  structureSnapshot,
  findTjrSwings,
} from './tjr-structure'
import type { Candle, Direction, PriceZone } from './types'

export type TjrDecision = Decision & {
  bias: Direction
  setupStatus: 'CONFIRMADA' | 'A_AGUARDAR' | 'BLOQUEADA'
  checklist: { label: string; complete: boolean; note: string }[]
  executionInterval?: '5m' | '15m'
  zones: PriceZone[]
}

type TradeSide = 'long' | 'short'

const isAligned = (value: Direction | undefined, side: TradeSide) =>
  (side === 'long' && value === 'bullish') || (side === 'short' && value === 'bearish')

const sideToAction = (side: TradeSide): Action => (side === 'long' ? 'COMPRAR' : 'VENDER')

const inferSide = (h4Trend: Direction, h1Trend: Direction, sweep?: Direction): TradeSide | undefined => {
  const trend = h4Trend !== 'neutral' ? h4Trend : h1Trend
  if (trend === 'bullish') return 'long'
  if (trend === 'bearish') return 'short'
  if (sweep === 'bullish') return 'long'
  if (sweep === 'bearish') return 'short'
  return undefined
}

const confirmationHit = (snap: ReturnType<typeof structureSnapshot>, side: TradeSide) => {
  if (isAligned(snap.bos, side)) return true
  if (isAligned(snap.inverse, side)) return true
  const last = snap.gaps.filter((g) => g.disrespected).at(-1)
  if (!last) return false
  return (side === 'long' && !last.bullish) || (side === 'short' && last.bullish)
}

const continuationHit = (snap: ReturnType<typeof structureSnapshot>, side: TradeSide) => {
  if (snap.eq !== undefined) {
    if (side === 'long' && priceInDiscount(snap.price, snap.eq, 'bullish')) return true
    if (side === 'short' && priceInPremium(snap.price, snap.eq, 'bearish')) return true
  }
  const gap = activeFairValueGap(snap.gaps, side === 'long' ? 'bullish' : 'bearish')
  if (gap && priceTouchesZone(snap.price, gap)) return true
  return false
}

const hasContinuationZone = (snap: ReturnType<typeof structureSnapshot>, side: TradeSide) => {
  const trend = side === 'long' ? 'bullish' : 'bearish'
  if (snap.eq !== undefined) return true
  return activeFairValueGap(snap.gaps, trend) !== undefined
}

const liquidityTargets = (candles: Candle[], side: TradeSide): number[] => {
  const session = latestSessionLevels(candles)
  const prevDay = previousDayLevels(candles)
  const swings = findTjrSwings(candles)
  const swingHigh = swings.filter((s) => s.type === 'high').at(-1)?.price
  const swingLow = swings.filter((s) => s.type === 'low').at(-1)?.price
  const levels: number[] = []
  for (const line of session) levels.push(line.price)
  for (const line of prevDay) levels.push(line.price)
  if (swingHigh !== undefined) levels.push(swingHigh)
  if (swingLow !== undefined) levels.push(swingLow)
  const price = candles.at(-1)?.close ?? 0
  if (side === 'long') return levels.filter((l) => l > price).sort((a, b) => a - b)
  return levels.filter((l) => l < price).sort((a, b) => b - a)
}

const buildLevels = (side: TradeSide, entry: number, targetCandles: Candle[], exec: ReturnType<typeof structureSnapshot>, minRr: number) => {
  const lowPrices = exec.swings.filter((s) => s.type === 'low').slice(-2).map((s) => s.price)
  const highPrices = exec.swings.filter((s) => s.type === 'high').slice(-2).map((s) => s.price)
  const rawStop = side === 'long'
    ? (lowPrices.length ? Math.min(...lowPrices) : entry * 0.99) * 0.998
    : (highPrices.length ? Math.max(...highPrices) : entry * 1.01) * 1.002
  const maxRiskPct = 0.03
  const stop = side === 'long'
    ? Math.max(rawStop, entry * (1 - maxRiskPct))
    : Math.min(rawStop, entry * (1 + maxRiskPct))
  const targets = liquidityTargets(targetCandles, side)
  let target = targets[0] ?? (side === 'long' ? entry * 1.015 : entry * 0.985)
  const risk = Math.abs(entry - stop)
  const minTarget = side === 'long' ? entry + risk * minRr : entry - risk * minRr
  if (side === 'long' && target < minTarget) target = minTarget
  if (side === 'short' && target > minTarget) target = minTarget
  const reward = Math.abs(target - entry)
  const riskReward = risk > 0 ? reward / risk : 0
  return { entry, stop, target, riskReward }
}

const collectZones = (...snaps: ReturnType<typeof structureSnapshot>[]): PriceZone[] => {
  const zones: PriceZone[] = []
  for (const snap of snaps) {
    if (snap.fvg) zones.push({ low: snap.fvg.low, high: snap.fvg.high, kind: 'fair-value-gap' })
    if (snap.eq !== undefined) zones.push({ low: snap.eq * 0.9995, high: snap.eq * 1.0005, kind: 'equilibrium' })
  }
  return zones
}

function evaluate(
  symbol: string,
  side: TradeSide | undefined,
  h4: ReturnType<typeof structureSnapshot>,
  h1: ReturnType<typeof structureSnapshot>,
  exec: ReturnType<typeof structureSnapshot>,
  execLabel: '5m' | '15m',
  primary1h: Candle[],
  btc1h: Candle[],
  profile: RiskProfile,
): TjrDecision {
  const minRr = riskProfiles[profile].minimumRiskReward
  const bias: Direction = side === 'long' ? 'bullish' : side === 'short' ? 'bearish' : 'neutral'

  if (!side) {
    return {
      action: 'ESPERAR',
      confidence: 'Baixa',
      reasons: ['Sem bias claro no 4h/1h e sem sweep de liquidez recente.'],
      bias: 'neutral',
      setupStatus: 'BLOQUEADA',
      checklist: [
        { label: 'Bias HTF', complete: false, note: '4h e 1h sem tendência definida.' },
        { label: 'Sweep de liquidez', complete: false, note: 'Nenhum sweep recente.' },
      ],
      zones: [],
    }
  }

  const gates = tjrGates[profile]
  const sweep = h1.sweep ?? h4.sweep
  const biasOk = (side === 'long' && (h4.trend === 'bullish' || h1.trend === 'bullish')) || (side === 'short' && (h4.trend === 'bearish' || h1.trend === 'bearish'))
  const sweepOk = isAligned(sweep, side)
  const liquidityOk = sweepOk || biasOk
  const confirmOk = confirmationHit(h1, side) || confirmationHit(exec, side) || confirmationHit(h4, side)
  const continueTouch = continuationHit(exec, side) || continuationHit(h1, side)
  const continueZone = hasContinuationZone(exec, side) || hasContinuationZone(h1, side)
  const continueOk = continueTouch || (!gates.requireContinuationTouch && continueZone)
  const smt = symbol !== 'BTCUSDT' ? smtDivergence(primary1h, btc1h) : undefined
  const smtAligned = symbol === 'BTCUSDT' || isAligned(smt, side)
  const smtOk = !gates.requireSmtAlign || smtAligned || smt === undefined
  const smtBlocked = gates.requireSmtAlign && smt !== undefined && !isAligned(smt, side)

  const { entry, stop, target, riskReward } = buildLevels(side, exec.price, primary1h, exec, minRr)
  const rrOk = riskReward >= minRr

  const checklist = [
    { label: 'Bias HTF (4h/1h)', complete: biasOk, note: side === 'long' ? 'Tendência altista no 4h ou 1h.' : 'Tendência baixista no 4h ou 1h.' },
    { label: 'Sweep de liquidez', complete: sweepOk, note: sweep ? `Sweep ${sweep === 'bullish' ? 'abaixo de lows' : 'acima de highs'}.` : gates.requireSweep ? 'Obrigatório neste perfil.' : 'Opcional — bias HTF basta.' },
    { label: 'Confirmação (BOS / inverse FVG)', complete: confirmOk, note: confirmOk ? 'Ordens preenchidas — estrutura mudou.' : `Precisa BOS ou inverse FVG no 1h ou ${execLabel}.` },
    { label: 'Continuação (FVG / equilibrium)', complete: continueTouch, note: continueTouch ? 'Retrace à zona de continuação.' : continueZone ? 'Zona disponível — aguardar retrace.' : 'Sem FVG/equilibrium ativo.' },
    { label: 'SMT vs BTC', complete: smtAligned || smt === undefined, note: symbol === 'BTCUSDT' ? 'Par de referência.' : smt ? `Divergência ${smt}.` : 'Sem divergência clara vs BTC.' },
    { label: `Risco/retorno ≥ ${minRr}×`, complete: rrOk, note: rrOk ? `${riskReward.toFixed(2)}× estimado.` : 'R:R insuficiente.' },
  ]

  const sweepGate = !gates.requireSweep || sweepOk
  const continueGate = gates.requireContinuationTouch ? continueTouch : continueOk
  const canAct = liquidityOk && sweepGate && confirmOk && continueGate && rrOk && smtOk && !smtBlocked
  const setupStatus = canAct ? 'CONFIRMADA' : confirmOk && liquidityOk ? 'A_AGUARDAR' : 'BLOQUEADA'

  const reasons: string[] = []
  if (sweepOk) reasons.push(`Liquidez: sweep ${side === 'long' ? 'abaixo de lows' : 'acima de highs'}.`)
  else if (biasOk) reasons.push(`Bias HTF ${side === 'long' ? 'altista' : 'baixista'}.`)
  if (confirmOk) reasons.push('Confirmação: BOS ou inverse fair value gap.')
  if (continueTouch) reasons.push(`Continuação: retrace a FVG/equilibrium (${execLabel}).`)
  else if (continueZone && !gates.requireContinuationTouch) reasons.push('Zona de continuação identificada.')
  if (smt && isAligned(smt, side)) reasons.push('SMT vs BTC alinhado.')
  if (smtBlocked) reasons.push('SMT vs BTC em conflito — bloqueado.')
  if (!canAct) reasons.push('Setup TJR incompleto — aguardar.')

  return {
    action: canAct ? sideToAction(side) : 'ESPERAR',
    confidence: canAct ? (riskReward >= minRr + 0.5 && continueTouch ? 'Alta' : 'Média') : 'Baixa',
    reasons,
    entry,
    stop,
    target,
    riskReward,
    bias,
    setupStatus,
    checklist,
    executionInterval: execLabel,
    zones: collectZones(h4, h1, exec),
  }
}

export function evaluateTjrQuick(symbol: string, candles1h: Candle[], btc1h: Candle[], profile: RiskProfile): TjrDecision {
  const h1 = structureSnapshot(candles1h)
  const h4proxy = structureSnapshot(candles1h.slice(-80))
  const side = inferSide(h4proxy.trend, h1.trend, h1.sweep ?? h4proxy.sweep)
  return evaluate(symbol, side, h4proxy, h1, h1, '15m', candles1h, btc1h, profile)
}

export function evaluateTjrFull(
  symbol: string,
  data: Record<'4h' | '1h' | '15m' | '5m', Candle[]>,
  btc: Record<'4h' | '1h' | '15m' | '5m', Candle[]>,
  profile: RiskProfile,
): TjrDecision {
  const h4 = structureSnapshot(data['4h'])
  const h1 = structureSnapshot(data['1h'])
  const aligned = h4.trend === h1.trend && h4.trend !== 'neutral'
  const execLabel = aligned ? '5m' : '15m'
  const exec = structureSnapshot(data[execLabel])
  const side = inferSide(h4.trend, h1.trend, h1.sweep ?? h4.sweep)
  return evaluate(symbol, side, h4, h1, exec, execLabel, data['1h'], btc['1h'], profile)
}

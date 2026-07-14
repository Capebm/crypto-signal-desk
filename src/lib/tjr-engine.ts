import type { Action, Decision } from './decision-engine'
import { BTC_REFERENCE_SYMBOL } from './binance'
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

export type EntryTiming = 'AGORA' | 'RETRACE' | 'NENHUM'

export type ExitPlan = {
  stopLoss: number
  takeProfit: number
  note: string
  steps: string[]
}

export type PositionGuidance = 'ENTRAR_AGORA' | 'AGUARDAR_ENTRADA' | 'MANTER' | 'SAIR' | 'REALIZAR_ALVO' | 'NEUTRO'

export type TjrDecision = Decision & {
  bias: Direction
  setupStatus: 'CONFIRMADA' | 'A_AGUARDAR' | 'BLOQUEADA'
  entryTiming: EntryTiming
  entryZone?: { low: number; high: number }
  positionGuidance: PositionGuidance
  invalidationReason?: string
  checklist: { label: string; complete: boolean; note: string }[]
  executionInterval?: '5m' | '15m'
  zones: PriceZone[]
  exitPlan?: ExitPlan
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

/** BOS contrário no TF de execução = invalidação da ideia (não entrar / sair se já dentro). */
const opposingBos = (snap: ReturnType<typeof structureSnapshot>, side: TradeSide) =>
  (side === 'long' && snap.bos === 'bearish') || (side === 'short' && snap.bos === 'bullish')

const bosInvalidationNote = (side: TradeSide, tfLabel: string, _snap: ReturnType<typeof structureSnapshot>) => {
  const dir = side === 'long' ? 'baixista' : 'altista'
  const swing = side === 'long' ? 'swing low' : 'swing high'
  return `BOS ${dir} no ${tfLabel}: close rompeu o último ${swing} — estrutura contra a tua posição.`
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

const continuationEntryZone = (snap: ReturnType<typeof structureSnapshot>, side: TradeSide): { low: number; high: number } | undefined => {
  const trend = side === 'long' ? 'bullish' : 'bearish'
  const gap = activeFairValueGap(snap.gaps, trend)
  if (gap) return { low: gap.low, high: gap.high }
  if (snap.eq !== undefined) return { low: snap.eq * 0.9995, high: snap.eq * 1.0005 }
  return undefined
}

const zoneMid = (zone: { low: number; high: number }) => (zone.low + zone.high) / 2

const priceZoneLabel = (zone: { low: number; high: number }) =>
  `${zone.low.toPrecision(4)}–${zone.high.toPrecision(4)}`

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

const buildExitPlan = (side: TradeSide, stop: number, target: number, entryTiming: EntryTiming): ExitPlan | undefined => {
  if (entryTiming === 'NENHUM') return undefined
  if (side === 'long') {
    return {
      stopLoss: stop,
      takeProfit: target,
      note: 'Spot long: protege com stop e realiza no alvo de liquidez.',
      steps: [
        'Ao entrar: stop-loss em stop (ordem stop-limit ou OCO).',
        'Take-profit limit em target — liquidez oposta (sessão/swing).',
        'Re-analisa periodicamente: se o agente mostrar SAIR — INVALIDADO, vende.',
        'Após +1R de lucro, podes subir o stop para abaixo do último swing low.',
      ],
    }
  }
  return {
    stopLoss: stop,
    takeProfit: target,
    note: 'Spot: não abres short — reduz ou sai se já tens a moeda.',
    steps: [
      'Se tens posição: coloca take-profit limit em target ou vende parcial no alvo.',
      'Stop de proteção acima de stop só se ainda segurares resto da posição.',
      'Sem posição: não entres short — apenas evita novas compras.',
      'Confirmação baixista + preço na zona = momento de reduzir exposição.',
    ],
  }
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
      entryTiming: 'NENHUM',
      positionGuidance: 'NEUTRO',
      zones: [],
    }
  }

  const execInvalidated = opposingBos(exec, side)
  const h1Invalidated = opposingBos(h1, side)
  const structureBroken = execInvalidated || h1Invalidated

  const gates = tjrGates[profile]
  const sweep = h1.sweep ?? h4.sweep
  const biasOk = (side === 'long' && (h4.trend === 'bullish' || h1.trend === 'bullish')) || (side === 'short' && (h4.trend === 'bearish' || h1.trend === 'bearish'))
  const sweepOk = isAligned(sweep, side)
  const liquidityOk = sweepOk || biasOk
  const confirmOk = confirmationHit(h1, side) || confirmationHit(exec, side) || confirmationHit(h4, side)
  const continueTouch = continuationHit(exec, side) || continuationHit(h1, side)
  const entryZone = continuationEntryZone(exec, side) ?? continuationEntryZone(h1, side)
  const smt = symbol !== BTC_REFERENCE_SYMBOL ? smtDivergence(primary1h, btc1h) : undefined
  const smtAligned = symbol === BTC_REFERENCE_SYMBOL || isAligned(smt, side)
  const smtOk = !gates.requireSmtAlign || smtAligned || smt === undefined
  const smtBlocked = gates.requireSmtAlign && smt !== undefined && !isAligned(smt, side)

  const sweepGate = !gates.requireSweep || sweepOk
  const setupReady = liquidityOk && sweepGate && confirmOk && smtOk && !smtBlocked && !structureBroken
  const entryTiming: EntryTiming = !setupReady ? 'NENHUM' : continueTouch ? 'AGORA' : 'RETRACE'
  const entryRef = entryTiming === 'AGORA' ? exec.price : entryZone ? zoneMid(entryZone) : exec.price
  const { entry: levelsEntry, stop, target, riskReward } = buildLevels(side, entryRef, primary1h, exec, minRr)
  const rrOk = riskReward >= minRr
  const setupReadyWithRr = setupReady && rrOk
  const finalTiming: EntryTiming = !setupReadyWithRr ? 'NENHUM' : entryTiming
  const entry = finalTiming === 'AGORA' ? exec.price : entryZone ? zoneMid(entryZone) : levelsEntry

  const stopTriggered = side === 'long' ? exec.price <= stop : exec.price >= stop
  const targetReached = side === 'long' ? exec.price >= target : exec.price <= target
  const invalidationSnap = execInvalidated ? exec : h1Invalidated ? h1 : undefined
  const invalidationLabel = execInvalidated ? execLabel : h1Invalidated ? '1h' : execLabel

  let positionGuidance: PositionGuidance = 'NEUTRO'
  let invalidationReason: string | undefined
  let action: Action = setupReadyWithRr ? sideToAction(side) : 'ESPERAR'
  let resolvedTiming: EntryTiming = finalTiming

  if (structureBroken || stopTriggered) {
    action = 'VENDER'
    resolvedTiming = 'AGORA'
    positionGuidance = 'SAIR'
    invalidationReason = structureBroken
      ? bosInvalidationNote(side, invalidationLabel, invalidationSnap!)
      : `Preço ${side === 'long' ? 'abaixo' : 'acima'} do stop — sai da posição.`
  } else if (targetReached) {
    action = 'VENDER'
    resolvedTiming = 'AGORA'
    positionGuidance = 'REALIZAR_ALVO'
    invalidationReason = 'Alvo de liquidez atingido — realiza lucro.'
  } else if (setupReadyWithRr) {
    positionGuidance = finalTiming === 'AGORA' ? 'ENTRAR_AGORA' : 'AGUARDAR_ENTRADA'
  }

  const checklist = [
    { label: 'Bias HTF (4h/1h)', complete: biasOk, note: side === 'long' ? 'Tendência altista no 4h ou 1h.' : 'Tendência baixista no 4h ou 1h.' },
    { label: 'Sweep de liquidez', complete: sweepOk, note: sweep ? `Sweep ${sweep === 'bullish' ? 'abaixo de lows' : 'acima de highs'}.` : gates.requireSweep ? 'Obrigatório neste perfil.' : 'Opcional — bias HTF basta.' },
    { label: 'Confirmação (BOS / inverse FVG)', complete: confirmOk, note: confirmOk ? 'Ordens preenchidas — estrutura mudou.' : `Precisa BOS ou inverse FVG no 1h ou ${execLabel}.` },
    { label: 'Continuação (FVG / equilibrium)', complete: continueTouch, note: continueTouch ? 'Preço na zona — entrada válida agora.' : entryZone ? `Aguardar retrace a ${priceZoneLabel(entryZone)}.` : 'Sem FVG/equilibrium ativo.' },
    {
      label: `Estrutura ${execLabel} intacta`,
      complete: !structureBroken,
      note: structureBroken
        ? `${bosInvalidationNote(side, invalidationLabel, invalidationSnap!)} Não entres; se já compraste, vende.`
        : `Sem BOS contrário no ${execLabel} — setup ainda válido.`,
    },
    { label: 'SMT vs BTC', complete: smtAligned || smt === undefined, note: symbol === BTC_REFERENCE_SYMBOL ? 'Par de referência.' : smt ? `Divergência ${smt}.` : 'Sem divergência clara vs BTC.' },
    { label: `Risco/retorno ≥ ${minRr}×`, complete: rrOk, note: rrOk ? `${riskReward.toFixed(2)}× estimado.` : 'R:R insuficiente.' },
  ]

  const setupStatus = positionGuidance === 'SAIR' || positionGuidance === 'REALIZAR_ALVO'
    ? 'BLOQUEADA'
    : setupReadyWithRr
      ? (resolvedTiming === 'AGORA' ? 'CONFIRMADA' : 'A_AGUARDAR')
      : confirmOk && liquidityOk && !structureBroken
        ? 'A_AGUARDAR'
        : 'BLOQUEADA'

  const reasons: string[] = []
  if (positionGuidance === 'SAIR') reasons.push(invalidationReason!)
  else if (positionGuidance === 'REALIZAR_ALVO') reasons.push(invalidationReason!)
  else {
    if (sweepOk) reasons.push(`Liquidez: sweep ${side === 'long' ? 'abaixo de lows' : 'acima de highs'}.`)
    else if (biasOk) reasons.push(`Bias HTF ${side === 'long' ? 'altista' : 'baixista'}.`)
    if (confirmOk) reasons.push('Confirmação: BOS ou inverse fair value gap.')
    if (resolvedTiming === 'AGORA') reasons.push(`Entrada agora — preço na zona FVG/equilibrium (${execLabel}).`)
    else if (resolvedTiming === 'RETRACE') reasons.push(`Aguardar retrace a ${entryZone ? priceZoneLabel(entryZone) : 'zona de continuação'}.`)
    if (structureBroken) reasons.push('BOS contrário bloqueia entrada.')
    if (smt && isAligned(smt, side)) reasons.push('SMT vs BTC alinhado.')
    if (smtBlocked) reasons.push('SMT vs BTC em conflito — bloqueado.')
    if (!setupReadyWithRr) reasons.push(setupReady && !rrOk ? 'R:R insuficiente para entrar.' : structureBroken ? 'Estrutura invalidada.' : 'Setup TJR incompleto — aguardar.')
  }

  return {
    action,
    confidence: positionGuidance === 'SAIR' ? 'Alta' : setupReadyWithRr ? (resolvedTiming === 'AGORA' && riskReward >= minRr + 0.5 ? 'Alta' : 'Média') : 'Baixa',
    reasons,
    entry,
    stop,
    target,
    riskReward,
    bias,
    setupStatus,
    entryTiming: resolvedTiming,
    entryZone,
    positionGuidance,
    invalidationReason,
    checklist,
    executionInterval: execLabel,
    zones: collectZones(h4, h1, exec),
    exitPlan: buildExitPlan(side, stop, target, resolvedTiming === 'NENHUM' ? 'RETRACE' : resolvedTiming),
  }
}

export function tjrActionLabel(decision: Pick<TjrDecision, 'action' | 'entryTiming' | 'positionGuidance'>): string {
  if (decision.positionGuidance === 'SAIR') return 'SAIR — INVALIDADO'
  if (decision.positionGuidance === 'REALIZAR_ALVO') return 'REALIZAR ALVO'
  if (decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA') return 'COMPRAR JÁ'
  if (decision.action === 'COMPRAR' && decision.entryTiming === 'RETRACE') return 'AGUARDAR COMPRA'
  if (decision.action === 'VENDER' && decision.entryTiming === 'AGORA') return 'SAIR JÁ'
  if (decision.action === 'VENDER' && decision.entryTiming === 'RETRACE') return 'PREPARAR SAÍDA'
  return decision.action
}

export function tjrSortRank(decision: TjrDecision): number {
  if (decision.positionGuidance === 'SAIR') return 0
  if (decision.positionGuidance === 'REALIZAR_ALVO') return 1
  if (decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA') return 2
  if (decision.action === 'COMPRAR' && decision.entryTiming === 'RETRACE') return 3
  if (decision.action === 'VENDER' && decision.entryTiming === 'AGORA') return 4
  if (decision.action === 'VENDER' && decision.entryTiming === 'RETRACE') return 5
  return 6
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

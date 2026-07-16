import type { Action, Decision } from './decision-engine'
import { BTC_REFERENCE_SYMBOL } from './binance'
import { computeLongStop, computeShortStop } from './trade-levels'
import { riskProfiles, tjrGates, type RiskProfile } from './risk-profile'
import { latestSessionLevels, previousDayLevels } from './sessions'
import {
  activeFairValueGap,
  hasDisplacement,
  ltfEntryConfirmation,
  priceInDiscount,
  priceInPremium,
  recentDrawLiquiditySweep,
  smtDivergence,
  structureSnapshot,
  findTjrSwings,
} from './tjr-structure'
import { getTradingSessionStatus } from './trading-session'
import { tpModeMeta, type TpMode } from './tp-mode'
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
  score: number
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
  /** Nível HTF do alvo principal (modo liquidez). */
  targetLabel?: string
  /** 2.º alvo de baixa resistência — realização parcial estilo TJR. */
  targetSecondary?: number
  targetSecondaryLabel?: string
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

const opposingBos = (snap: ReturnType<typeof structureSnapshot>, side: TradeSide) =>
  (side === 'long' && snap.bos === 'bearish') || (side === 'short' && snap.bos === 'bullish')

const bosInvalidationNote = (side: TradeSide, tfLabel: string) => {
  const dir = side === 'long' ? 'baixista' : 'altista'
  const swing = side === 'long' ? 'swing low' : 'swing high'
  return `BOS ${dir} no ${tfLabel}: close rompeu o último ${swing} — estrutura contra a tua posição.`
}

const continuationHit = (snap: ReturnType<typeof structureSnapshot>, side: TradeSide) => {
  const zone = continuationEntryZone(snap, side)
  if (!zone) return false
  const pad = snap.price * 0.0004
  return snap.price >= zone.low - pad && snap.price <= zone.high + pad
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

type LiquidityLevel = { price: number; priority: number; label: string }

const liquidityTargets = (candles: Candle[], side: TradeSide): LiquidityLevel[] => {
  const session = latestSessionLevels(candles)
  const prevDay = previousDayLevels(candles)
  const swings = findTjrSwings(candles)
  const swingHigh = swings.filter((s) => s.type === 'high').at(-1)?.price
  const swingLow = swings.filter((s) => s.type === 'low').at(-1)?.price
  const scored: LiquidityLevel[] = []
  for (const line of session) {
    scored.push({
      price: line.price,
      priority: line.session === 'newyork' ? 3 : line.session === 'london' ? 2 : 1,
      label: line.title,
    })
  }
  for (const line of prevDay) scored.push({ price: line.price, priority: 4, label: line.title })
  if (swingHigh !== undefined) scored.push({ price: swingHigh, priority: 0, label: 'Swing H' })
  if (swingLow !== undefined) scored.push({ price: swingLow, priority: 0, label: 'Swing L' })
  const price = candles.at(-1)?.close ?? 0
  const filtered = side === 'long'
    ? scored.filter((l) => l.price > price)
    : scored.filter((l) => l.price < price)
  return filtered.sort((a, b) => (side === 'long' ? a.price - b.price : b.price - a.price))
}

type LevelPlan = {
  entry: number
  stop: number
  target: number
  riskReward: number
  targetLabel?: string
  targetSecondary?: number
  targetSecondaryLabel?: string
}

/** Stop no 2º swing; alvo conforme modo TP (1R / 1.5R / liquidez). */
const buildLevels = (
  side: TradeSide,
  entry: number,
  targetCandles: Candle[],
  exec: ReturnType<typeof structureSnapshot>,
  minRr: number,
  tpMode: TpMode,
): LevelPlan => {
  const lows = exec.swings.filter((s) => s.type === 'low').map((s) => s.price)
  const highs = exec.swings.filter((s) => s.type === 'high').map((s) => s.price)
  const rawStop = side === 'long'
    ? (lows.at(-2) ?? lows.at(-1) ?? entry * 0.99) * 0.998
    : (highs.at(-2) ?? highs.at(-1) ?? entry * 1.01) * 1.002
  const stop = side === 'long' ? computeLongStop(entry, rawStop) : computeShortStop(entry, rawStop)
  const risk = Math.abs(entry - stop)

  const fixedMultiple = tpModeMeta[tpMode].multiple
  if (fixedMultiple !== undefined) {
    const target = side === 'long' ? entry + risk * fixedMultiple : entry - risk * fixedMultiple
    return { entry, stop, target, riskReward: fixedMultiple }
  }

  const candidates = liquidityTargets(targetCandles, side)
  const maxRr = 3
  let best: { price: number; rr: number; priority: number; label: string } | undefined
  for (const level of candidates) {
    const reward = Math.abs(level.price - entry)
    const rr = risk > 0 ? reward / risk : 0
    if (rr < minRr || rr > maxRr) continue
    if (!best || level.priority > best.priority || (level.priority === best.priority && Math.abs(rr - 1.5) < Math.abs(best.rr - 1.5))) {
      best = { price: level.price, rr, priority: level.priority, label: level.label }
    }
  }
  const fallbackLevel = candidates[0]
  const target = best?.price ?? fallbackLevel?.price ?? (side === 'long' ? entry * 1.015 : entry * 0.985)
  const targetLabel = best?.label ?? fallbackLevel?.label
  const reward = Math.abs(target - entry)
  const riskReward = risk > 0 ? reward / risk : 0

  const minGap = entry * 0.003
  const secondary = candidates.find((level) => {
    if (Math.abs(level.price - target) < minGap) return false
    const rr2 = risk > 0 ? Math.abs(level.price - entry) / risk : 0
    return side === 'long' ? level.price > target && rr2 <= maxRr + 0.5 : level.price < target && rr2 <= maxRr + 0.5
  })

  return {
    entry,
    stop,
    target,
    riskReward,
    targetLabel,
    targetSecondary: secondary?.price,
    targetSecondaryLabel: secondary?.label,
  }
}

const buildExitPlan = (
  side: TradeSide,
  stop: number,
  target: number,
  entryTiming: EntryTiming,
  targetSecondary?: number,
  targetLabel?: string,
  targetSecondaryLabel?: string,
): ExitPlan | undefined => {
  if (entryTiming === 'NENHUM') return undefined
  if (side === 'long') {
    const partial = targetSecondary !== undefined
    return {
      stopLoss: stop,
      takeProfit: target,
      note: partial
        ? `Spot long TJR: realiza 50% em ${targetLabel ?? 'TP1'} e resto em ${targetSecondaryLabel ?? 'TP2'}.`
        : 'Spot long: protege com stop e realiza no alvo de liquidez.',
      steps: partial
        ? [
            'OCO com 50%: TP limit no 1.º draw HTF (baixa resistência) + stop abaixo do swing.',
            `Limit sell 50% restante em ${targetSecondaryLabel ?? '2.º alvo'} — só coloca após fill da compra.`,
            'Re-analisa: cartão SAIR = vende o resto a mercado.',
            'Após +1R, podes subir stop para abaixo do último swing low.',
          ]
        : [
            'Ao entrar: stop-loss em stop (ordem stop-limit ou OCO).',
            `Take-profit limit em target${targetLabel ? ` (${targetLabel})` : ''} — liquidez oposta.`,
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
  candles1m?: Candle[],
  execCandles?: Candle[],
  quickScan = false,
  tpMode: TpMode = '1_5r',
): TjrDecision {
  const minRr = riskProfiles[profile].minimumRiskReward
  const bias: Direction = side === 'long' ? 'bullish' : side === 'short' ? 'bearish' : 'neutral'

  if (!side) {
    return {
      action: 'ESPERAR',
      confidence: 'Baixa',
      score: 0,
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
  const session = getTradingSessionStatus()
  const drawLevels = [
    ...latestSessionLevels(primary1h).map((l) => l.price),
    ...previousDayLevels(primary1h).map((l) => l.price),
    ...findTjrSwings(primary1h).slice(-6).map((s) => s.price),
    ...h4.swings.slice(-4).map((s) => s.price),
  ]
  const drawSweep = recentDrawLiquiditySweep(primary1h, drawLevels)
  const microSweep = h1.sweep ?? h4.sweep
  const sweep = drawSweep ?? (profile === 'agressivo' ? microSweep : undefined)
  const sweepOk = isAligned(sweep, side)

  const h4Opposed = (side === 'long' && h4.trend === 'bearish') || (side === 'short' && h4.trend === 'bullish')
  const biasOk = !h4Opposed && (
    (side === 'long' && (h4.trend === 'bullish' || (h1.trend === 'bullish' && sweepOk)))
    || (side === 'short' && (h4.trend === 'bearish' || (h1.trend === 'bearish' && sweepOk)))
    || (profile === 'agressivo' && ((side === 'long' && h1.trend === 'bullish') || (side === 'short' && h1.trend === 'bearish')))
  )

  const liquidityOk = gates.requireSweep ? sweepOk : sweepOk || biasOk
  const confirmExec = confirmationHit(exec, side)
  const confirmHtf = confirmationHit(h1, side)
  const displaceCandles = execCandles ?? primary1h
  const displacementOk = profile === 'agressivo' || hasDisplacement(displaceCandles)
  const confirmOk = confirmExec && confirmHtf && displacementOk

  const continueTouch = continuationHit(exec, side) || continuationHit(h1, side)
  const entryZone = continuationEntryZone(exec, side) ?? continuationEntryZone(h1, side)
  const continuationOk = !gates.requireContinuationTouch || Boolean(entryZone)

  const ltf = candles1m && candles1m.length >= 12 ? ltfEntryConfirmation(candles1m, side) : { ready: false as const }
  const ltfReady = ltf.ready

  const eq = exec.eq ?? h1.eq ?? h4.eq
  const locationPrice = continueTouch ? exec.price : entryZone ? zoneMid(entryZone) : exec.price
  const locationOk = !eq
    ? profile === 'agressivo'
    : side === 'long'
      ? priceInDiscount(locationPrice, eq, 'bullish')
      : priceInPremium(locationPrice, eq, 'bearish')

  const smt = symbol !== BTC_REFERENCE_SYMBOL ? smtDivergence(primary1h, btc1h) : undefined
  const smtAligned = symbol === BTC_REFERENCE_SYMBOL || isAligned(smt, side)
  const smtOk = !gates.requireSmtAlign || smtAligned || smt === undefined
  const smtBlocked = gates.requireSmtAlign && smt !== undefined && !isAligned(smt, side)
  const indexAligned = symbol === BTC_REFERENCE_SYMBOL || smt === undefined || isAligned(smt, side)

  const sweepGate = !gates.requireSweep || sweepOk
  const setupReady = liquidityOk && sweepGate && confirmOk && continuationOk && locationOk && smtOk && !smtBlocked && !structureBroken && indexAligned && biasOk

  const entryTiming: EntryTiming = !setupReady
    ? 'NENHUM'
    : ltfReady && !quickScan
      ? 'AGORA'
      : entryZone || continueTouch
        ? 'RETRACE'
        : 'NENHUM'

  const entryRef = entryTiming === 'AGORA'
    ? (ltf.entryPrice ?? exec.price)
    : entryZone
      ? zoneMid(entryZone)
      : exec.price

  const {
    entry: levelsEntry,
    stop,
    target,
    riskReward,
    targetLabel,
    targetSecondary,
    targetSecondaryLabel,
  } = buildLevels(side, entryRef, primary1h, exec, minRr, tpMode)
  const rrOk = tpMode === 'liquidez' ? riskReward >= minRr && riskReward <= 3.05 : riskReward >= (tpModeMeta[tpMode].multiple ?? minRr) * 0.99
  const setupReadyWithRr = setupReady && rrOk && entryTiming !== 'NENHUM'

  let sessionBlocked = false
  let sessionDowngrade = false
  if (setupReadyWithRr) {
    if (session.blockEntries) {
      sessionBlocked = true
    } else if (entryTiming === 'AGORA' && !session.allowEnterNow && profile !== 'agressivo') {
      sessionDowngrade = true
    }
  }

  const finalTiming: EntryTiming = sessionBlocked || !setupReadyWithRr
    ? 'NENHUM'
    : sessionDowngrade
      ? 'RETRACE'
      : entryTiming

  const entry = finalTiming === 'AGORA'
    ? (ltf.entryPrice ?? exec.price)
    : entryZone
      ? zoneMid(entryZone)
      : levelsEntry

  const tradeReady = setupReadyWithRr && !sessionBlocked

  const stopTriggered = side === 'long' ? exec.price <= stop : exec.price >= stop
  const targetReached = side === 'long' ? exec.price >= target : exec.price <= target
  const invalidationLabel = execInvalidated ? execLabel : h1Invalidated ? '1h' : execLabel

  let positionGuidance: PositionGuidance = 'NEUTRO'
  let invalidationReason: string | undefined
  let action: Action = tradeReady ? sideToAction(side) : 'ESPERAR'
  let resolvedTiming: EntryTiming = finalTiming

  if (structureBroken || stopTriggered) {
    action = 'VENDER'
    resolvedTiming = 'AGORA'
    positionGuidance = 'SAIR'
    invalidationReason = structureBroken
      ? bosInvalidationNote(side, invalidationLabel)
      : `Preço ${side === 'long' ? 'abaixo' : 'acima'} do stop — sai da posição.`
  } else if (targetReached) {
    action = 'VENDER'
    resolvedTiming = 'AGORA'
    positionGuidance = 'REALIZAR_ALVO'
    invalidationReason = 'Alvo de liquidez atingido — realiza lucro.'
  } else if (tradeReady) {
    positionGuidance = finalTiming === 'AGORA' ? 'ENTRAR_AGORA' : 'AGUARDAR_ENTRADA'
  }

  const checklist = [
    { label: '1. Sweep (draw HTF)', complete: sweepOk, note: sweepOk ? `Sweep em draw sessão/1h/4h (${sweep}).` : gates.requireSweep ? 'Obrigatório: wick além de session/1h/4h high-low.' : 'Opcional neste perfil.' },
    { label: '2. Confirmação + displacement', complete: confirmOk, note: confirmOk ? `BOS/IFVG no ${execLabel}+1h com displacement.` : !displacementOk ? 'Sem displacement no candle de confirmação.' : `Precisa BOS/IFVG no ${execLabel} e 1h.` },
    { label: '3. Continuação (FVG / EQ)', complete: continuationOk && Boolean(entryZone), note: entryZone ? `Zona ${priceZoneLabel(entryZone)}.` : gates.requireContinuationTouch ? 'Sem FVG/EQ — bloqueado.' : 'Sem zona.' },
    { label: '4. Entrada 1m (retrace→BOS)', complete: ltfReady, note: quickScan ? 'Scan rápido — expande para 1m.' : ltfReady ? `Preço BOS 1m: ${ltf.entryPrice?.toPrecision(5) ?? '—'}.` : 'À espera do BOS 1m de entrada.' },
    { label: 'Bias HTF (4h)', complete: biasOk, note: h4Opposed ? '4h contrário — bloqueado.' : biasOk ? `4h ${h4.trend} / 1h ${h1.trend}.` : 'Sem bias válido.' },
    { label: 'Discount / premium', complete: locationOk, note: !eq ? (locationOk ? 'Sem EQ — agressivo ok.' : 'Sem equilibrium.') : locationOk ? (side === 'long' ? 'Discount.' : 'Premium.') : 'Fora da zona vs EQ.' },
    { label: `Estrutura ${execLabel} intacta`, complete: !structureBroken, note: structureBroken ? bosInvalidationNote(side, invalidationLabel) : `Sem BOS contrário no ${execLabel}.` },
    { label: 'Alinhamento vs BTC', complete: indexAligned, note: symbol === BTC_REFERENCE_SYMBOL ? 'Referência.' : !indexAligned ? 'Desalinhado — sem trade.' : smt ? `SMT ${smt}.` : 'Ok.' },
    { label: `R:R / TP (${tpModeMeta[tpMode].short})`, complete: rrOk, note: rrOk ? `${riskReward.toFixed(2)}× · modo ${tpModeMeta[tpMode].label}.` : `R:R ${riskReward.toFixed(2)}× insuficiente para o modo TP.` },
    { label: 'Killzone open/close', complete: !sessionBlocked, note: `${session.badge} · ${session.nowNy} ET / ${session.nowLisbon} Lisboa${sessionDowngrade ? ' · AGORA→AGUARDAR' : ''}.` },
  ]

  const setupStatus = positionGuidance === 'SAIR' || positionGuidance === 'REALIZAR_ALVO'
    ? 'BLOQUEADA'
    : tradeReady
      ? (resolvedTiming === 'AGORA' ? 'CONFIRMADA' : 'A_AGUARDAR')
      : confirmOk && liquidityOk && !structureBroken
        ? 'A_AGUARDAR'
        : 'BLOQUEADA'

  const reasons: string[] = []
  if (positionGuidance === 'SAIR' || positionGuidance === 'REALIZAR_ALVO') reasons.push(invalidationReason!)
  else {
    if (sweepOk) reasons.push('1· Sweep HTF.')
    if (confirmOk) reasons.push('2· Confirmação + displacement.')
    if (resolvedTiming === 'AGORA') reasons.push(`4· Entrada 1m @ ${entry.toPrecision(5)}.`)
    else if (resolvedTiming === 'RETRACE') reasons.push(ltfReady ? 'Aguardar NY open ou zona.' : '3· À espera BOS 1m.')
    if (h4Opposed) reasons.push('4h contrário.')
    if (!locationOk) reasons.push(side === 'long' ? 'Fora de discount.' : 'Fora de premium.')
    if (!indexAligned) reasons.push('Alt vs BTC desalinhados.')
    if (sessionBlocked) reasons.push(`${session.badge}: sem entradas.`)
    else if (sessionDowngrade) reasons.push(`${session.badge}: só AGUARDAR.`)
    if (quickScan && tradeReady) reasons.push('Expande para preço 1m exacto.')
    if (!tradeReady && !sessionBlocked) {
      reasons.push(setupReady && !rrOk ? 'R:R fora de 1–3×.' : structureBroken ? 'Estrutura invalidada.' : 'Setup TJR incompleto.')
    }
  }

  return finalize({
    action,
    confidence: positionGuidance === 'SAIR' ? 'Alta' : tradeReady ? (resolvedTiming === 'AGORA' && riskReward >= minRr + 0.3 ? 'Alta' : 'Média') : 'Baixa',
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
    targetLabel,
    targetSecondary,
    targetSecondaryLabel,
    exitPlan: buildExitPlan(
      side,
      stop,
      target,
      resolvedTiming === 'NENHUM' ? 'RETRACE' : resolvedTiming,
      targetSecondary,
      targetLabel,
      targetSecondaryLabel,
    ),
  }, minRr)
}

export function computeTjrScore(decision: TjrDecision, minRr = 1.5): number {
  const steps = decision.checklist.filter((item) => /^[1-4]\./.test(item.label))
  const stepsPct = steps.filter((item) => item.complete).length / Math.max(steps.length, 1)
  const checklistPct = decision.checklist.filter((item) => item.complete).length / Math.max(decision.checklist.length, 1)

  const actionWeight =
    decision.positionGuidance === 'SAIR' ? 0.92
      : decision.positionGuidance === 'REALIZAR_ALVO' ? 0.88
        : decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA' ? 1
          : decision.action === 'COMPRAR' && decision.entryTiming === 'RETRACE' ? 0.72
            : decision.action === 'VENDER' ? 0.65
              : 0.22

  const rr = decision.riskReward ?? 0
  const rrFactor = rr >= minRr && rr <= 3 ? Math.min(1, 0.55 + (rr - minRr) / 2.5) : rr > 0 ? 0.25 : 0
  const setupFactor = decision.setupStatus === 'CONFIRMADA' ? 1 : decision.setupStatus === 'A_AGUARDAR' ? 0.55 : 0.15
  const confFactor = decision.confidence === 'Alta' ? 1 : decision.confidence === 'Média' ? 0.7 : 0.35
  const raw = actionWeight * (stepsPct * 0.35 + checklistPct * 0.15 + setupFactor * 0.25 + confFactor * 0.1 + rrFactor * 0.15)

  return Math.round(Math.min(100, Math.max(0, raw * 100)))
}

function finalize(decision: Omit<TjrDecision, 'score'>, minRr: number): TjrDecision {
  const scored = { ...decision, score: 0 } as TjrDecision
  scored.score = computeTjrScore(scored, minRr)
  return scored
}

export function tjrScoreColor(score: number): string {
  if (score >= 75) return '#26a69a'
  if (score >= 50) return '#2962ff'
  if (score >= 30) return '#ff9800'
  return '#787b86'
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

export function evaluateTjrQuick(
  symbol: string,
  candles1h: Candle[],
  btc1h: Candle[],
  profile: RiskProfile,
  tpMode: TpMode = '1_5r',
): TjrDecision {
  const h1 = structureSnapshot(candles1h)
  const h4proxy = structureSnapshot(candles1h.slice(-80))
  const side = inferSide(h4proxy.trend, h1.trend, h1.sweep ?? h4proxy.sweep)
  return evaluate(symbol, side, h4proxy, h1, h1, '15m', candles1h, btc1h, profile, undefined, candles1h, true, tpMode)
}

export function evaluateTjrFull(
  symbol: string,
  data: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  btc: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  profile: RiskProfile,
  tpMode: TpMode = '1_5r',
  forcedSide?: TradeSide,
): TjrDecision {
  const h4 = structureSnapshot(data['4h'])
  const h1 = structureSnapshot(data['1h'])
  const aligned = h4.trend === h1.trend && h4.trend !== 'neutral'
  const execLabel = aligned ? '5m' : '15m'
  const exec = structureSnapshot(data[execLabel])
  const side = forcedSide ?? inferSide(h4.trend, h1.trend, h1.sweep ?? h4.sweep)
  return evaluate(symbol, side, h4, h1, exec, execLabel, data['1h'], btc['1h'], profile, data['1m'], data[execLabel], false, tpMode)
}

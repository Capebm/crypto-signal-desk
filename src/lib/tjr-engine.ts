import type { Action, Decision } from './decision-engine'
import { BTC_REFERENCE_SYMBOL } from './binance'
import { computeLongStop, computeShortStop } from './trade-levels'
import { riskProfiles, tjrGates, type RiskProfile } from './risk-profile'
import { latestSessionLevels, previousDayLevels } from './sessions'
import {
  activeFairValueGap,
  hasDisplacement,
  isReactiveSweep,
  ltfEntryConfirmation,
  priceInDiscount,
  priceInPremium,
  recentDrawLiquiditySweepDetailed,
  smtDivergence,
  structureSnapshot,
  findTjrSwings,
  type DrawLevel,
  type SweepSource,
} from './tjr-structure'
import { getTradingSessionStatus } from './trading-session'
import { tpModeMeta, tpModes, type TpMode } from './tp-mode'
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
  /** Draw HTF que foi swept (Ásia / Londres / NY / swings). */
  sweepSource?: SweepSource
  sweepLabel?: string
  /** Sweep pré-NY → reagir no open sem esperar outro raid. */
  reactive?: boolean
  /** Sweep de high (setup de short) — Spot não compra (salvo allowHighSweepLong). */
  opposedSweep?: boolean
  /** Malha/CFD: opposed presente mas sweep alinhado manda — não bloqueia. */
  softOpposed?: boolean
  /** Long permitido apesar de sweep de high (arriscado). */
  riskyHighLong?: boolean
  /** Combinações risco×TP que também dão COMPRAR JÁ. */
  matchingSetups?: SetupHit[]
  /** Setup cujos níveis (entry/stop/TP) estão no cartão. */
  tradeSetup?: SetupHit
  /** Swings 4h/1h para markup no gráfico. */
  htfLevels?: { price: number; title: string; kind: 'high' | 'low' }[]
}

export type SetupHit = {
  profile: RiskProfile
  tpMode: TpMode
  label: string
  score: number
  action?: Action
}

export type EvaluateOptions = {
  /** Spot: permite COMPRAR mesmo com sweep de high (default false). */
  allowHighSweepLong?: boolean
  /** Rótulo do alinhamento SMT (ex. US500 no módulo T212). */
  referenceLabel?: string
  /**
   * Malha larga: gates + sessão como Agressivo (Londres / NY mid OK),
   * mas R:R mínimo do perfil escolhido. Continua a exigir BOS 1m para AGORA.
   */
  wideNet?: boolean
  /**
   * Override do gate SMT do perfil.
   * T212: índices → true (Conservador); forex/metal/energia → false (informativo).
   */
  requireSmtAlign?: boolean
  /**
   * CFD prático (T212): confirmação exec OU 1h; BOS 5m conta como entrada se 1m falhar;
   * discount mais flexível. Mais oportunidades, menos “puro” TJR.
   */
  cfdPractical?: boolean
  /** Sessão: crypto Spot ignora fecho CFD de fim de semana. Default cfd. */
  sessionMarket?: 'cfd' | 'crypto'
  /** Só com posição aberta: stop/alvo teóricos podem disparar SAIR / REALIZAR. */
  openPosition?: boolean
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
  options: EvaluateOptions = {},
  candles5m?: Candle[],
): TjrDecision {
  const allowHighSweepLong = Boolean(options.allowHighSweepLong)
  const wideNet = Boolean(options.wideNet)
  const cfdPractical = Boolean(options.cfdPractical)
  /** Flexível = Agressivo, Malha larga ou CFD prático. */
  const flexible = profile === 'agressivo' || wideNet || cfdPractical
  const referenceLabel = options.referenceLabel ?? 'BTC'
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

  const gatesBase = wideNet ? tjrGates.agressivo : tjrGates[profile]
  const gates = {
    ...gatesBase,
    requireSmtAlign: options.requireSmtAlign ?? gatesBase.requireSmtAlign,
  }
  const session = getTradingSessionStatus(new Date(), { market: options.sessionMarket ?? 'cfd' })
  const sessionLines = latestSessionLevels(primary1h)
  const prevDay = previousDayLevels(primary1h)
  const swings1h = findTjrSwings(primary1h)
  const allDraws: DrawLevel[] = [
    ...sessionLines.map((line) => ({
      price: line.price,
      source: line.session as SweepSource,
      label: line.title,
      kind: line.kind,
    })),
    ...prevDay.map((line) => ({
      price: line.price,
      source: 'prev_day' as const,
      label: line.title,
      kind: line.kind,
    })),
    ...swings1h.slice(-6).map((s) => ({
      price: s.price,
      source: 'swing_1h' as const,
      label: s.type === 'high' ? '1h H' : '1h L',
      kind: s.type,
    })),
    ...h4.swings.slice(-4).map((s) => ({
      price: s.price,
      source: 'swing_4h' as const,
      label: s.type === 'high' ? '4h H' : '4h L',
      kind: s.type,
    })),
  ]
  // Long Spot: só sweeps de LOWS contam a favor; highs são aviso (não short aqui).
  const alignedDraws = allDraws.filter((d) => (side === 'long' ? d.kind === 'low' : d.kind === 'high'))
  const opposedDraws = allDraws.filter((d) => (side === 'long' ? d.kind === 'high' : d.kind === 'low'))
  const drawHit = recentDrawLiquiditySweepDetailed(primary1h, alignedDraws)
  const opposedHit = recentDrawLiquiditySweepDetailed(primary1h, opposedDraws)
  const microSweep = h1.sweep ?? h4.sweep
  const sweep = drawHit?.direction ?? (flexible && isAligned(microSweep, side) ? microSweep : undefined)
  const sweepOk = isAligned(sweep, side)
  const opposedSweep = Boolean(
    opposedHit
    && ((side === 'long' && opposedHit.direction === 'bearish') || (side === 'short' && opposedHit.direction === 'bullish')),
  )
  const riskyHighLong = allowHighSweepLong && side === 'long' && opposedSweep
  // CFD prático / Malha larga: se já há sweep alinhado, o oposto é aviso — não veto (evita chop a matar os dois lados).
  const softOpposed = (cfdPractical || wideNet) && sweepOk && opposedSweep
  const blockOpposed = opposedSweep && !riskyHighLong && !softOpposed
  const sweepSource: SweepSource = sweepOk && drawHit ? drawHit.source : sweepOk && microSweep ? 'swing_1h' : 'none'
  const sweepLabel = sweepOk && drawHit
    ? (softOpposed && opposedHit ? `${drawHit.label} · oposto aviso` : drawHit.label)
    : opposedSweep && opposedHit
      ? (riskyHighLong ? `${opposedHit.label} · H arriscado` : `${opposedHit.label} · não comprar`)
      : sweepOk
        ? 'Micro L'
        : undefined
  const reactive = isReactiveSweep(sweepSource, side, sweep)

  const h4Opposed = (side === 'long' && h4.trend === 'bearish') || (side === 'short' && h4.trend === 'bullish')
  const biasOk = !h4Opposed && (
    (side === 'long' && (h4.trend === 'bullish' || (h1.trend === 'bullish' && sweepOk)))
    || (side === 'short' && (h4.trend === 'bearish' || (h1.trend === 'bearish' && sweepOk)))
    || (flexible && !blockOpposed && ((side === 'long' && h1.trend === 'bullish') || (side === 'short' && h1.trend === 'bearish')))
  )

  const liquidityOk = gates.requireSweep ? sweepOk : sweepOk || (biasOk && !blockOpposed)
  const confirmExec = confirmationHit(exec, side)
  const confirmHtf = confirmationHit(h1, side)
  const displaceCandles = execCandles ?? primary1h
  const displacementOk = flexible || hasDisplacement(displaceCandles)
  const confirmOk = cfdPractical
    ? (confirmExec || confirmHtf) && displacementOk
    : confirmExec && confirmHtf && displacementOk

  const continueTouch = continuationHit(exec, side) || continuationHit(h1, side)
  const entryZone = continuationEntryZone(exec, side) ?? continuationEntryZone(h1, side)
  const continuationOk = !gates.requireContinuationTouch || Boolean(entryZone)

  const ltf1m = candles1m && candles1m.length >= 12 ? ltfEntryConfirmation(candles1m, side) : { ready: false as const }
  const ltf5m = cfdPractical && candles5m && candles5m.length >= 12
    ? ltfEntryConfirmation(candles5m, side, 36)
    : { ready: false as const }
  const ltfReady = ltf1m.ready || Boolean(ltf5m.ready)
  const ltfEntryPrice = ltf1m.entryPrice ?? ltf5m.entryPrice
  const ltfVia5m = Boolean(cfdPractical && !ltf1m.ready && ltf5m.ready)

  const eq = exec.eq ?? h1.eq ?? h4.eq
  const locationPrice = continueTouch ? exec.price : entryZone ? zoneMid(entryZone) : exec.price
  const inDiscount = eq ? priceInDiscount(locationPrice, eq, 'bullish') : false
  const inPremium = eq ? priceInPremium(locationPrice, eq, 'bearish') : false
  const nearEqLong = Boolean(cfdPractical && eq && side === 'long' && locationPrice <= eq * 1.003)
  const nearEqShort = Boolean(cfdPractical && eq && side === 'short' && locationPrice >= eq * 0.997)
  const locationOk = !eq
    ? flexible
    : side === 'long'
      ? inDiscount || nearEqLong
      : inPremium || nearEqShort

  const smt = symbol !== BTC_REFERENCE_SYMBOL ? smtDivergence(primary1h, btc1h) : undefined
  const smtAligned = symbol === BTC_REFERENCE_SYMBOL || isAligned(smt, side)
  const smtOk = !gates.requireSmtAlign || smtAligned || smt === undefined
  const smtBlocked = gates.requireSmtAlign && smt !== undefined && !isAligned(smt, side)
  // Só bloqueia desalinhamento quando SMT é obrigatório (antes bloqueava sempre se SMT existisse).
  const indexAligned = !gates.requireSmtAlign
    || symbol === BTC_REFERENCE_SYMBOL
    || smt === undefined
    || isAligned(smt, side)

  const sweepGate = !gates.requireSweep || sweepOk
  const setupReady = liquidityOk && sweepGate && confirmOk && continuationOk && locationOk && smtOk && !smtBlocked && !structureBroken && indexAligned && biasOk && !blockOpposed

  const entryTiming: EntryTiming = !setupReady
    ? 'NENHUM'
    : ltfReady && !quickScan
      ? 'AGORA'
      : entryZone || continueTouch
        ? 'RETRACE'
        : 'NENHUM'

  const entryRef = entryTiming === 'AGORA'
    ? (ltfEntryPrice ?? exec.price)
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
    } else if (entryTiming === 'AGORA' && !session.allowEnterNow && !flexible) {
      // Reactivo (sweep Ásia/Londres/dia ant.): permite COMPRAR JÁ também no NY mid.
      const reactiveNy = reactive && (session.window === 'ny' || session.window === 'ny_open')
      if (!reactiveNy) sessionDowngrade = true
    }
  }

  const finalTiming: EntryTiming = sessionBlocked || !setupReadyWithRr
    ? 'NENHUM'
    : sessionDowngrade
      ? 'RETRACE'
      : entryTiming

  const entry = finalTiming === 'AGORA'
    ? (ltfEntryPrice ?? exec.price)
    : entryZone
      ? zoneMid(entryZone)
      : levelsEntry

  const tradeReady = setupReadyWithRr && !sessionBlocked

  // SAIR / stop / alvo só com posição aberta — no scanner é ESPERAR (não “sair” do nada).
  const stopTriggered = Boolean(options.openPosition)
    && (side === 'long' ? exec.price <= stop : exec.price >= stop)
  const targetReached = Boolean(options.openPosition)
    && (side === 'long' ? exec.price >= target : exec.price <= target)
  const invalidationLabel = execInvalidated ? execLabel : h1Invalidated ? '1h' : execLabel
  const exitInvalidation = Boolean(options.openPosition) && (structureBroken || stopTriggered)

  let positionGuidance: PositionGuidance = 'NEUTRO'
  let invalidationReason: string | undefined
  let action: Action = tradeReady ? sideToAction(side) : 'ESPERAR'
  let resolvedTiming: EntryTiming = finalTiming

  if (exitInvalidation) {
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
  } else if (structureBroken) {
    invalidationReason = bosInvalidationNote(side, invalidationLabel)
  }

  const sweepNote = opposedSweep && opposedHit
    ? (riskyHighLong
      ? `Sweep de HIGH (${opposedHit.label}) — long ARRISCADO (toggle activo). Continuação possível; não é setup TJR clássico.`
      : softOpposed
        ? (side === 'long'
          ? `Sweep de LOW ok; ${opposedHit.label} oposto = aviso (malha/CFD) — não bloqueia.`
          : `Sweep de HIGH ok; ${opposedHit.label} oposto = aviso (malha/CFD) — não bloqueia.`)
        : side === 'long'
          ? `Sweep de HIGH (${opposedHit.label}) — bloqueia long (opposed). Spot não shorta.`
          : `Sweep de LOW (${opposedHit.label}) — bloqueia short (opposed).`)
    : !sweepOk
      ? (gates.requireSweep ? 'Obrigatório: wick além de um LOW HTF (Ásia L / Londres L / 1h L…).' : 'Sem sweep de low — opcional neste perfil, desde que sem sweep de high.')
      : reactive
        ? `Reactivo · ${sweepLabel} (low) — sweep pré-NY; não esperes outro raid.`
        : side === 'short'
          ? `Sweep de HIGH · ${sweepLabel} (${sweep}).`
          : `Sweep de LOW · ${sweepLabel} (${sweep}).`

  const checklist = [
    { label: '1. Sweep (draw HTF)', complete: (sweepOk && !blockOpposed) || riskyHighLong, note: sweepNote },
    { label: '2. Confirmação + displacement', complete: confirmOk, note: confirmOk
      ? (cfdPractical && !(confirmExec && confirmHtf)
        ? `CFD prático · BOS/IFVG no ${confirmExec ? execLabel : '1h'}.`
        : `BOS/IFVG no ${execLabel}+1h com displacement.`)
      : !displacementOk ? 'Sem displacement no candle de confirmação.' : `Precisa BOS/IFVG no ${execLabel} e 1h.` },
    { label: '3. Continuação (FVG / EQ)', complete: continuationOk && Boolean(entryZone), note: entryZone ? `Zona ${priceZoneLabel(entryZone)}.` : gates.requireContinuationTouch ? 'Sem FVG/EQ — bloqueado.' : 'Sem zona.' },
    { label: '4. Entrada LTF (retrace→BOS)', complete: ltfReady, note: quickScan
      ? 'Scan rápido — expande para LTF.'
      : ltfReady
        ? (ltfVia5m
          ? `CFD prático · BOS 5m @ ${ltfEntryPrice?.toPrecision(5) ?? '—'}.`
          : `Preço BOS 1m: ${ltfEntryPrice?.toPrecision(5) ?? '—'}.`)
        : 'À espera do BOS 1m (ou 5m em CFD prático).' },
    { label: 'Bias HTF (4h)', complete: biasOk, note: h4Opposed ? '4h contrário — bloqueado.' : biasOk ? `4h ${h4.trend} / 1h ${h1.trend}.` : 'Sem bias válido.' },
    { label: 'Discount / premium', complete: locationOk, note: !eq ? (locationOk ? `Sem EQ — ${flexible ? 'flexível ok.' : 'agressivo ok.'}` : 'Sem equilibrium.') : locationOk ? (side === 'long' ? (nearEqLong && !inDiscount ? 'Perto do EQ (CFD prático).' : 'Discount.') : (nearEqShort && !inPremium ? 'Perto do EQ (CFD prático).' : 'Premium.')) : 'Fora da zona vs EQ.' },
    { label: `Estrutura ${execLabel} intacta`, complete: !structureBroken, note: structureBroken ? bosInvalidationNote(side, invalidationLabel) : `Sem BOS contrário no ${execLabel}.` },
    { label: `Alinhamento vs ${referenceLabel}`, complete: indexAligned || !gates.requireSmtAlign, note: !gates.requireSmtAlign
      ? (smtAligned ? `SMT ${smt ?? 'n/d'} (informativo).` : smt ? `SMT ${smt} (informativo — não bloqueia).` : 'SMT opcional neste instrumento.')
      : symbol === BTC_REFERENCE_SYMBOL ? 'Referência.' : !indexAligned ? 'Desalinhado — sem trade.' : smt ? `SMT ${smt}.` : 'Ok.' },
    { label: `R:R / TP (${tpModeMeta[tpMode].short})`, complete: rrOk, note: rrOk ? `${riskReward.toFixed(2)}× · modo ${tpModeMeta[tpMode].label}.` : `R:R ${riskReward.toFixed(2)}× insuficiente para o modo TP.` },
    { label: 'Killzone open/close', complete: !sessionBlocked, note: `${session.badge} · ${session.nowNy} ET / ${session.nowLisbon} Lisboa${sessionDowngrade ? ' · AGORA→AGUARDAR' : wideNet && !session.allowEnterNow ? ' · malha larga' : reactive && !sessionDowngrade && !session.allowEnterNow ? ' · reactivo OK' : ''}.` },
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
    if (opposedSweep && opposedHit && !riskyHighLong && !softOpposed) {
      reasons.push(side === 'long'
        ? `Sweep de high (${opposedHit.label}): bloqueia long (opposed).`
        : `Sweep de low (${opposedHit.label}): bloqueia short (opposed).`)
    }
    if (softOpposed && opposedHit) {
      reasons.push(side === 'long'
        ? `Opposed ${opposedHit.label} = aviso (malha/CFD); sweep LOW manda.`
        : `Opposed ${opposedHit.label} = aviso (malha/CFD); sweep HIGH manda.`)
    }
    if (riskyHighLong && opposedHit) reasons.push(`Long arriscado após sweep de high (${opposedHit.label}).`)
    if (sweepOk) reasons.push(reactive ? `1· Sweep reactivo de low (${sweepLabel}).` : '1· Sweep de low HTF.')
    if (confirmOk) reasons.push('2· Confirmação + displacement.')
    if (resolvedTiming === 'AGORA') reasons.push(`4· Entrada 1m @ ${entry.toPrecision(5)}.`)
    else if (resolvedTiming === 'RETRACE') reasons.push(ltfReady ? 'Aguardar NY open ou zona.' : '3· À espera BOS LTF.')
    if (ltfVia5m) reasons.push('Entrada via BOS 5m (CFD prático — Yahoo 1m fraco).')
    if (h4Opposed) reasons.push('4h contrário.')
    if (!locationOk) reasons.push(side === 'long' ? 'Fora de discount.' : 'Fora de premium.')
    if (!indexAligned && gates.requireSmtAlign) reasons.push(`Alt vs ${referenceLabel} desalinhados.`)
    if (sessionBlocked) reasons.push(`${session.badge}: sem entradas.`)
    else if (sessionDowngrade) reasons.push(`${session.badge}: só AGUARDAR.`)
    if (quickScan && tradeReady) reasons.push('Expande para preço 1m exacto.')
    if (!tradeReady && !sessionBlocked && !blockOpposed) {
      reasons.push(setupReady && !rrOk ? 'R:R fora de 1–3×.' : structureBroken ? 'Estrutura invalidada.' : 'Setup TJR incompleto.')
    }
  }

  const htfLevels = [
    ...h4.swings.slice(-4).map((s) => ({ price: s.price, title: s.type === 'high' ? '4h H' : '4h L', kind: s.type })),
    ...swings1h.slice(-6).map((s) => ({ price: s.price, title: s.type === 'high' ? '1h H' : '1h L', kind: s.type })),
  ]

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
    sweepSource,
    sweepLabel,
    reactive,
    opposedSweep,
    softOpposed,
    riskyHighLong,
    htfLevels,
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
  if (score >= 75) return '#3dffb5'
  if (score >= 50) return '#ffb020'
  return '#5d7390'
}

export function tjrActionLabel(
  decision: Pick<TjrDecision, 'action' | 'entryTiming' | 'positionGuidance'>,
  opts: { cfd?: boolean } = {},
): string {
  if (decision.positionGuidance === 'SAIR') return 'SAIR — INVALIDADO'
  if (decision.positionGuidance === 'REALIZAR_ALVO') return 'REALIZAR ALVO'
  if (opts.cfd) {
    if (decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA') return 'LONG JÁ'
    if (decision.action === 'COMPRAR' && decision.entryTiming === 'RETRACE') return 'AGUARDAR LONG'
    if (decision.action === 'VENDER' && decision.entryTiming === 'AGORA') return 'SHORT JÁ'
    if (decision.action === 'VENDER' && decision.entryTiming === 'RETRACE') return 'AGUARDAR SHORT'
    return decision.action
  }
  if (decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA') return 'COMPRAR JÁ'
  if (decision.action === 'COMPRAR' && decision.entryTiming === 'RETRACE') return 'AGUARDAR COMPRA'
  if (decision.action === 'VENDER' && decision.entryTiming === 'AGORA') return 'SAIR JÁ'
  if (decision.action === 'VENDER' && decision.entryTiming === 'RETRACE') return 'PREPARAR SAÍDA'
  return decision.action
}

/** Texto de timing — nunca “Entrar agora” quando o setup está invalidado. */
export function tjrTimingLabel(
  decision: Pick<TjrDecision, 'entryTiming' | 'positionGuidance'>,
): string {
  if (decision.positionGuidance === 'SAIR') return 'Invalidado — não entrar'
  if (decision.positionGuidance === 'REALIZAR_ALVO') return 'Realizar alvo'
  if (decision.positionGuidance === 'ENTRAR_AGORA' && decision.entryTiming === 'AGORA') return 'Entrar agora'
  if (decision.entryTiming === 'RETRACE' || decision.positionGuidance === 'AGUARDAR_ENTRADA') return 'Aguardar retrace'
  return 'Sem entrada'
}

/** Entrada long válida (não é invalidação / realizar alvo). */
export function isEnterLongNow(decision: Pick<TjrDecision, 'action' | 'entryTiming' | 'positionGuidance'>): boolean {
  return decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA' && decision.positionGuidance === 'ENTRAR_AGORA'
}

/** Entrada short válida (CFD) — exclui SAIR — INVALIDADO. */
export function isEnterShortNow(decision: Pick<TjrDecision, 'action' | 'entryTiming' | 'positionGuidance'>): boolean {
  return decision.action === 'VENDER' && decision.entryTiming === 'AGORA' && decision.positionGuidance === 'ENTRAR_AGORA'
}

export function isAwaitingEntry(decision: Pick<TjrDecision, 'action' | 'entryTiming' | 'positionGuidance'>): boolean {
  return (decision.action === 'COMPRAR' || decision.action === 'VENDER')
    && decision.entryTiming === 'RETRACE'
    && (decision.positionGuidance === 'AGUARDAR_ENTRADA' || decision.positionGuidance === 'ENTRAR_AGORA' || decision.positionGuidance === 'NEUTRO')
}

export function tjrSortRank(decision: TjrDecision): number {
  if (decision.positionGuidance === 'SAIR') return 0
  if (decision.positionGuidance === 'REALIZAR_ALVO') return 1
  if (isEnterLongNow(decision)) return 2
  if (decision.action === 'COMPRAR' && decision.entryTiming === 'RETRACE') return 3
  if (isEnterShortNow(decision)) return 4
  if (decision.action === 'VENDER' && decision.entryTiming === 'RETRACE') return 5
  return 6
}

export function evaluateTjrQuick(
  symbol: string,
  candles1h: Candle[],
  btc1h: Candle[],
  profile: RiskProfile,
  tpMode: TpMode = '1_5r',
  options: EvaluateOptions = {},
  forcedSide?: TradeSide,
): TjrDecision {
  const h1 = structureSnapshot(candles1h)
  const h4proxy = structureSnapshot(candles1h.slice(-80))
  const side = forcedSide ?? inferSide(h4proxy.trend, h1.trend, h1.sweep ?? h4proxy.sweep)
  return evaluate(symbol, side, h4proxy, h1, h1, '15m', candles1h, btc1h, profile, undefined, candles1h, true, tpMode, options)
}

export function evaluateTjrFull(
  symbol: string,
  data: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  btc: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  profile: RiskProfile,
  tpMode: TpMode = '1_5r',
  forcedSide?: TradeSide,
  options: EvaluateOptions = {},
): TjrDecision {
  const h4 = structureSnapshot(data['4h'])
  const h1 = structureSnapshot(data['1h'])
  const aligned = h4.trend === h1.trend && h4.trend !== 'neutral'
  const execLabel = aligned ? '5m' : '15m'
  const exec = structureSnapshot(data[execLabel])
  const side = forcedSide ?? inferSide(h4.trend, h1.trend, h1.sweep ?? h4.sweep)
  return evaluate(symbol, side, h4, h1, exec, execLabel, data['1h'], btc['1h'], profile, data['1m'], data[execLabel], false, tpMode, options, data['5m'])
}

const setupLabel = (profile: RiskProfile, tpMode: TpMode) =>
  `${riskProfiles[profile].label} · ${tpModeMeta[tpMode].short}`

export { setupLabel as formatSetupHitLabel }

/** Testa risco × TP e devolve os que dão COMPRAR JÁ (mesmo candle pack). */
export function listBuyNowSetups(
  symbol: string,
  data: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  btc: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  options: EvaluateOptions = {},
  forcedSide?: TradeSide,
): SetupHit[] {
  return listActionNowSetups(symbol, data, btc, options, forcedSide, 'buy')
}

/** COMPRAR e/ou VENDER com timing AGORA (CFD T212). */
export function listActionNowSetups(
  symbol: string,
  data: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  btc: Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>,
  options: EvaluateOptions = {},
  forcedSide?: TradeSide,
  mode: 'buy' | 'both' = 'buy',
): SetupHit[] {
  const profiles: RiskProfile[] = ['conservador', 'equilibrado', 'agressivo']
  const hits: SetupHit[] = []
  for (const profile of profiles) {
    for (const modeTp of tpModes) {
      const decision = evaluateTjrFull(symbol, data, btc, profile, modeTp, forcedSide, options)
      const buyNow = isEnterLongNow(decision)
      const sellNow = mode === 'both' && isEnterShortNow(decision)
      if (buyNow || sellNow) {
        const sideTag = decision.action === 'VENDER' ? ' · Sell' : ''
        hits.push({
          profile,
          tpMode: modeTp,
          label: `${setupLabel(profile, modeTp)}${sideTag}`,
          score: decision.score,
          action: decision.action,
        })
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score)
}

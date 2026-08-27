import type { Candle } from './types'

/** Stop/target math — shared by TJR engine and tests. */

export type InstrumentKind = 'index' | 'future' | 'forex' | 'metal' | 'energy' | 'crypto' | 'stock'

export function averageTrueRange(candles: Candle[], period = 14): number | undefined {
  if (candles.length < 2) return undefined
  const recent = candles.slice(-(period + 1))
  const ranges: number[] = []
  for (let index = 1; index < recent.length; index += 1) {
    const candle = recent[index]
    const previousClose = recent[index - 1].close
    ranges.push(Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    ))
  }
  const atr = ranges.reduce((sum, value) => sum + value, 0) / ranges.length
  return Number.isFinite(atr) && atr > 0 ? atr : undefined
}

/**
 * Chão de stop cripto: alts baratas precisam de % largo (OCO a 1 tick).
 * BTC/ETH/SOL (≥ 1) usam estrutura/ATR — 3,5% destruía o R:R vs liquidez próxima.
 */
export function cryptoStopBand(entry: number): { minStopPct: number; maxStopPct: number } {
  const maxStopPct = 0.08
  if (entry < 0.001) return { minStopPct: 0.08, maxStopPct }
  if (entry < 0.01) return { minStopPct: 0.06, maxStopPct }
  if (entry < 1) return { minStopPct: 0.035, maxStopPct }
  return { minStopPct: 0.008, maxStopPct }
}

export function computeLongStop(entry: number, rawStop: number): number {
  const { minStopPct, maxStopPct } = cryptoStopBand(entry)
  return Math.max(entry * (1 - maxStopPct), Math.min(rawStop, entry * (1 - minStopPct)))
}

export function computeShortStop(entry: number, rawStop: number): number {
  const { minStopPct, maxStopPct } = cryptoStopBand(entry)
  return Math.min(entry * (1 + maxStopPct), Math.max(rawStop, entry * (1 + minStopPct)))
}

/** Mínimo de risco: forex 0,15%; índices 0,20%. Crypto: 0,8% líquidos / 3,5–8% alts. */
export function instrumentMinStopPct(kind: InstrumentKind, entry: number): number {
  if (kind === 'crypto') return cryptoStopBand(entry).minStopPct
  if (kind === 'forex') return 0.0015
  if (kind === 'energy') return 0.003
  if (kind === 'stock') return 0.004
  if (kind === 'metal') return 0.002
  return 0.002
}

/** Alarga um stop de ruído LTF; no cripto também cap a 8%. Nunca puxa o stop para dentro do sweep. */
export function applyStopFloor(
  side: 'long' | 'short',
  entry: number,
  rawStop: number,
  instrumentKind: InstrumentKind,
  rangeAtr?: number,
): number {
  const minDist = Math.max(
    entry * instrumentMinStopPct(instrumentKind, entry),
    rangeAtr !== undefined && rangeAtr > 0 ? rangeAtr * 0.6 : 0,
  )
  if (side === 'long') {
    let stop = Math.min(rawStop, entry - minDist)
    if (instrumentKind === 'crypto') {
      stop = Math.max(entry * (1 - cryptoStopBand(entry).maxStopPct), stop)
    }
    return stop
  }
  let stop = Math.max(rawStop, entry + minDist)
  if (instrumentKind === 'crypto') {
    stop = Math.min(entry * (1 + cryptoStopBand(entry).maxStopPct), stop)
  }
  return stop
}

type StructuralStopOptions = {
  side: 'long' | 'short'
  entry: number
  swingPrices: number[]
  candles: Candle[]
  instrumentKind: InstrumentKind
  /** HTF (1h) para o chão de ATR — o exec 1m/5m sozinho é ruído. */
  rangeCandles?: Candle[]
}

/** Stop além do 2.º swing + ATR; chão por instrumento para não colar ao 1m. */
export function computeStructuralStop({
  side,
  entry,
  swingPrices,
  candles,
  instrumentKind,
  rangeCandles,
}: StructuralStopOptions): number | undefined {
  const relevant = swingPrices.filter((price) => side === 'long' ? price < entry : price > entry)
  const structural = relevant.at(-2) ?? relevant.at(-1)
  const atr = averageTrueRange(candles)
  const buffer = atr !== undefined ? atr * 0.15 : entry * 0.0005

  let stop: number | undefined
  if (structural !== undefined) {
    stop = side === 'long' ? structural - buffer : structural + buffer
  } else if (atr !== undefined) {
    stop = side === 'long' ? entry - atr : entry + atr
  } else if (instrumentKind === 'crypto') {
    stop = side === 'long' ? entry * 0.99 : entry * 1.01
  }
  if (stop === undefined) return undefined
  const rangeAtr = averageTrueRange(rangeCandles ?? candles)
  return applyStopFloor(side, entry, stop, instrumentKind, rangeAtr)
}

export type LiquidityCandidate = {
  price: number
  priority: number
  label: string
}

export type TradeLevelPlan = {
  entry: number
  stop: number
  target: number
  riskReward: number
  targetLabel?: string
  targetSecondary?: number
  targetSecondaryLabel?: string
  levelsValid: boolean
  opposingDraw?: LiquidityCandidate
  headroomRr: number
}

/** Stop estrutural + alvo que nunca atravessa o draw oposto mais próximo. */
export function buildTradeLevels({
  side,
  entry,
  swingPrices,
  candles,
  instrumentKind,
  candidates,
  minRr,
  fixedMultiple,
  rangeCandles,
}: {
  side: 'long' | 'short'
  entry: number
  swingPrices: number[]
  candles: Candle[]
  instrumentKind: InstrumentKind
  candidates: LiquidityCandidate[]
  minRr: number
  fixedMultiple?: number
  rangeCandles?: Candle[]
}): TradeLevelPlan {
  const stop = computeStructuralStop({
    side,
    entry,
    swingPrices,
    candles,
    instrumentKind,
    rangeCandles,
  })
  const invalid: TradeLevelPlan = {
    entry,
    stop: stop ?? entry,
    target: entry,
    riskReward: 0,
    levelsValid: false,
    headroomRr: 0,
  }
  if (stop === undefined || (side === 'long' ? stop >= entry : stop <= entry)) return invalid

  const risk = Math.abs(entry - stop)
  const beyond = candidates
    .filter((level) => (side === 'long' ? level.price > entry : level.price < entry))
    .sort((a, b) => (side === 'long' ? a.price - b.price : b.price - a.price))
  const opposingDraw = beyond[0]
  const headroomRr = opposingDraw && risk > 0 ? Math.abs(opposingDraw.price - entry) / risk : 0

  if (fixedMultiple !== undefined) {
    const rawTarget = side === 'long' ? entry + risk * fixedMultiple : entry - risk * fixedMultiple
    const crossesDraw = Boolean(
      opposingDraw
      && (side === 'long' ? rawTarget > opposingDraw.price : rawTarget < opposingDraw.price),
    )
    const target = crossesDraw ? opposingDraw!.price : rawTarget
    return {
      entry,
      stop,
      target,
      riskReward: risk > 0 ? Math.abs(target - entry) / risk : 0,
      targetLabel: crossesDraw ? opposingDraw?.label : undefined,
      levelsValid: true,
      opposingDraw,
      headroomRr,
    }
  }

  const maxRr = 3
  let best: { price: number; rr: number; priority: number; label: string } | undefined
  for (const level of beyond) {
    const reward = Math.abs(level.price - entry)
    const rr = risk > 0 ? reward / risk : 0
    if (rr < minRr || rr > maxRr) continue
    if (!best || level.priority > best.priority || (level.priority === best.priority && Math.abs(rr - 1.5) < Math.abs(best.rr - 1.5))) {
      best = { price: level.price, rr, priority: level.priority, label: level.label }
    }
  }
  if (!best) {
    return {
      entry,
      stop,
      target: opposingDraw?.price ?? entry,
      riskReward: headroomRr,
      targetLabel: opposingDraw?.label,
      levelsValid: false,
      opposingDraw,
      headroomRr,
    }
  }

  const minGap = entry * 0.003
  const secondary = beyond.find((level) => {
    if (Math.abs(level.price - best.price) < minGap) return false
    const rr2 = risk > 0 ? Math.abs(level.price - entry) / risk : 0
    return side === 'long'
      ? level.price > best.price && rr2 <= maxRr + 0.5
      : level.price < best.price && rr2 <= maxRr + 0.5
  })

  return {
    entry,
    stop,
    target: best.price,
    riskReward: best.rr,
    targetLabel: best.label,
    targetSecondary: secondary?.price,
    targetSecondaryLabel: secondary?.label,
    levelsValid: true,
    opposingDraw,
    headroomRr,
  }
}

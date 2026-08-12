import type { Candle, Direction, PriceZone } from './types'

export type SwingPoint = { type: 'high' | 'low'; price: number; index: number }

const isUp = (c: Candle) => c.close >= c.open
const isDown = (c: Candle) => c.close < c.open

/** TJR: up + down = high; down + up = low (highest/lowest wick of the pair). */
export function findTjrSwings(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = []
  for (let index = 1; index < candles.length; index += 1) {
    const prev = candles[index - 1]
    const curr = candles[index]
    if (isUp(prev) && isDown(curr)) swings.push({ type: 'high', price: Math.max(prev.high, curr.high), index })
    if (isDown(prev) && isUp(curr)) swings.push({ type: 'low', price: Math.min(prev.low, curr.low), index })
  }
  return swings
}

export function trendFromSwings(swings: SwingPoint[]): Direction {
  const highs = swings.filter((s) => s.type === 'high').map((s) => s.price)
  const lows = swings.filter((s) => s.type === 'low').map((s) => s.price)
  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs.at(-1)! > highs.at(-2)!
    const hl = lows.at(-1)! > lows.at(-2)!
    const lh = highs.at(-1)! < highs.at(-2)!
    const ll = lows.at(-1)! < lows.at(-2)!
    if (hh && hl) return 'bullish'
    if (lh && ll) return 'bearish'
  }
  return 'neutral'
}

export type FairValueGap = PriceZone & { bullish: boolean; index: number; disrespected: boolean }

export function findFairValueGaps(candles: Candle[], lookback = 40): FairValueGap[] {
  const gaps: FairValueGap[] = []
  const start = Math.max(2, candles.length - lookback)
  for (let index = start; index < candles.length; index += 1) {
    const first = candles[index - 2]
    const middle = candles[index - 1]
    const third = candles[index]
    const body = Math.abs(middle.close - middle.open)
    const avgBody = average(candles.slice(Math.max(0, index - 12), index).map((c) => Math.abs(c.close - c.open)))
    if (body < avgBody * 0.6) continue

    if (third.low > first.high) {
      gaps.push(makeGap(first.high, third.low, true, index, candles, index))
    } else if (third.high < first.low) {
      gaps.push(makeGap(third.high, first.low, false, index, candles, index))
    }
  }
  return gaps
}

const makeGap = (low: number, high: number, bullish: boolean, index: number, candles: Candle[], fromIndex: number): FairValueGap => {
  let disrespected = false
  for (const candle of candles.slice(fromIndex + 1)) {
    if (bullish && candle.close < low) { disrespected = true; break }
    if (!bullish && candle.close > high) { disrespected = true; break }
  }
  return { low, high, kind: 'fair-value-gap', bullish, index, disrespected }
}

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1)

/** Wick takes level then closes back inside = liquidity sweep. */
export function recentLiquiditySweep(candles: Candle[], swings: SwingPoint[], lookback = 20): Direction | undefined {
  const recent = candles.slice(-lookback)
  const offset = candles.length - lookback
  const relevant = swings.filter((s) => s.index >= offset - 5)

  for (let i = recent.length - 1; i >= 1; i -= 1) {
    const candle = recent[i]
    const highs = relevant.filter((s) => s.type === 'high' && s.index < offset + i)
    for (const swing of highs.slice(-4)) {
      if (candle.high > swing.price && candle.close < swing.price) return 'bearish'
    }
    const lows = relevant.filter((s) => s.type === 'low' && s.index < offset + i)
    for (const swing of lows.slice(-4)) {
      if (candle.low < swing.price && candle.close > swing.price) return 'bullish'
    }
  }
  return undefined
}

/** TJR: sweep só conta se o wick tomar um draw HTF (níveis passados), não um micro-swing. */
export function recentDrawLiquiditySweep(candles: Candle[], drawLevels: number[], lookback = 24): Direction | undefined {
  return recentDrawLiquiditySweepDetailed(
    candles,
    drawLevels.map((price) => ({ price, source: 'swing_1h' as const, label: 'Draw', kind: 'low' as const })),
    lookback,
  )?.direction
}

export type SweepSource = 'asia' | 'london' | 'newyork' | 'prev_day' | 'swing_1h' | 'swing_4h' | 'none'

export type DrawLevel = { price: number; source: SweepSource; label: string; kind: 'high' | 'low' }

export type DrawSweepHit = {
  direction: Direction
  source: SweepSource
  label: string
  price: number
  kind: 'high' | 'low'
}

/** Prioridade: sessões (Ásia→Londres→NY) e dia ant. antes de swings. */
const sourceRank = (source: SweepSource) => {
  if (source === 'asia') return 0
  if (source === 'london') return 1
  if (source === 'prev_day') return 2
  if (source === 'newyork') return 3
  if (source === 'swing_4h') return 4
  if (source === 'swing_1h') return 5
  return 9
}

/** Wick toma nível + close de volta; devolve o draw HTF atingido (para label reactivo). */
export function recentDrawLiquiditySweepDetailed(
  candles: Candle[],
  draws: DrawLevel[],
  lookback = 36,
): DrawSweepHit | undefined {
  if (!draws.length) return undefined
  const ranked = [...draws].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.price - b.price)
  const recent = candles.slice(-lookback)
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const candle = recent[i]
    for (const level of ranked) {
      // High levels: only count as high-raid (bearish opportunity)
      if (level.kind === 'high' && candle.high > level.price && candle.close < level.price) {
        return { direction: 'bearish', source: level.source, label: level.label, price: level.price, kind: 'high' }
      }
      // Low levels: only count as low-raid (bullish opportunity)
      if (level.kind === 'low' && candle.low < level.price && candle.close > level.price) {
        return { direction: 'bullish', source: level.source, label: level.label, price: level.price, kind: 'low' }
      }
    }
  }
  return undefined
}

/** Sweep pré-NY (Ásia / Londres / dia ant.) → trade reactivo no open, sem esperar novo raid. */
export function isReactiveSweep(source: SweepSource | undefined, side: 'long' | 'short', direction?: Direction): boolean {
  if (!source || source === 'none') return false
  const pre = source === 'asia' || source === 'london' || source === 'prev_day'
  if (!pre) return false
  if (side === 'long') return direction === 'bullish'
  return direction === 'bearish'
}

export type LtfEntryResult = {
  ready: boolean
  entryPrice?: number
  /** Houve BOS/iFVG 1m contrário (retrace 5m) na janela. */
  retraceSeen: boolean
  /** Sinal de entrada: BOS ou iFVG. */
  entryVia?: 'bos' | 'ifvg'
}

/** BOS ou iFVG no fecho do slice (vídeo TJR: ambos válidos no LTF). */
export function ltfConfirmSignal(candles: Candle[]): { direction: Direction; via: 'bos' | 'ifvg' } | undefined {
  if (candles.length < 6) return undefined
  const swings = findTjrSwings(candles)
  const bos = breakOfStructure(candles, swings)
  if (bos === 'bullish' || bos === 'bearish') return { direction: bos, via: 'bos' }
  const gaps = findFairValueGaps(candles)
  const trend = trendFromSwings(swings)
  const inverse = recentInverseFvg(gaps, trend)
  if (inverse === 'bullish' || inverse === 'bearish') return { direction: inverse, via: 'ifvg' }
  const last = gaps.filter((g) => g.disrespected).at(-1)
  if (!last) return undefined
  // Bullish FVG disrespected → bearish; bearish FVG disrespected → bullish
  return { direction: last.bullish ? 'bearish' : 'bullish', via: 'ifvg' }
}

/**
 * TJR step 4: retrace (1m BOS/iFVG contrário) → BOS/iFVG 1m na direção.
 * Devolve o close do candle de entrada (preço a copiar).
 */
export function ltfEntryConfirmation(
  candles1m: Candle[],
  side: 'long' | 'short',
  lookback = 45,
): LtfEntryResult {
  if (candles1m.length < 12) return { ready: false, retraceSeen: false }
  const window = candles1m.slice(-lookback)
  let sawRetrace = false
  let entryAt: number | undefined
  let entryVia: 'bos' | 'ifvg' | undefined
  for (let end = 6; end <= window.length; end += 1) {
    const signal = ltfConfirmSignal(window.slice(0, end))
    if (!signal) continue
    const aligned = (side === 'long' && signal.direction === 'bullish') || (side === 'short' && signal.direction === 'bearish')
    const opposite = (side === 'long' && signal.direction === 'bearish') || (side === 'short' && signal.direction === 'bullish')
    if (opposite) {
      sawRetrace = true
      entryAt = undefined
      entryVia = undefined
    }
    if (aligned && sawRetrace) {
      entryAt = end
      entryVia = signal.via
    }
  }
  const ready = entryAt !== undefined && entryAt >= window.length - 5
  if (!ready || entryAt === undefined) return { ready: false, retraceSeen: sawRetrace }
  return { ready: true, entryPrice: window[entryAt - 1]?.close, retraceSeen: true, entryVia }
}

/** Candle de confirmação com corpo ≥ 1.2× média = displacement (mudança de order flow). */
export function hasDisplacement(candles: Candle[], lookback = 14): boolean {
  if (candles.length < 3) return false
  const last = candles.at(-1)!
  const body = Math.abs(last.close - last.open)
  const avg = candles
    .slice(-lookback - 1, -1)
    .map((c) => Math.abs(c.close - c.open))
    .reduce((a, b) => a + b, 0) / Math.max(1, Math.min(lookback, candles.length - 1))
  return body >= avg * 1.2
}

/** BOS: body close beyond the most recent swing high (bullish) or low (bearish). */
export function breakOfStructure(candles: Candle[], swings: SwingPoint[]): Direction | undefined {
  const close = candles.at(-1)?.close ?? 0
  const lastHigh = swings.filter((s) => s.type === 'high').at(-1)?.price
  const lastLow = swings.filter((s) => s.type === 'low').at(-1)?.price
  if (lastHigh !== undefined && close > lastHigh) return 'bullish'
  if (lastLow !== undefined && close < lastLow) return 'bearish'
  return undefined
}

/** Inverse FVG: continuation gap disrespected → confirmation of reversal. */
export function recentInverseFvg(gaps: FairValueGap[], trend: Direction): Direction | undefined {
  const recent = gaps.filter((g) => g.disrespected).at(-1)
  if (!recent) return undefined
  if (trend === 'bullish' && !recent.bullish) return 'bearish'
  if (trend === 'bearish' && recent.bullish) return 'bullish'
  return undefined
}

/** 50% between most recent swing low and high in the active leg. */
export function equilibriumPrice(swings: SwingPoint[]): number | undefined {
  const lastHigh = swings.filter((s) => s.type === 'high').at(-1)?.price
  const lastLow = swings.filter((s) => s.type === 'low').at(-1)?.price
  if (lastHigh === undefined || lastLow === undefined) return undefined
  return (lastHigh + lastLow) / 2
}

export function priceInDiscount(price: number, eq: number, trend: Direction) {
  if (trend === 'bullish') return price <= eq
  if (trend === 'bearish') return price >= eq
  return false
}

export function priceInPremium(price: number, eq: number, trend: Direction) {
  if (trend === 'bullish') return price >= eq
  if (trend === 'bearish') return price <= eq
  return false
}

export function activeFairValueGap(gaps: FairValueGap[], trend: Direction): FairValueGap | undefined {
  const valid = gaps.filter((g) => !g.disrespected && ((trend === 'bullish' && g.bullish) || (trend === 'bearish' && !g.bullish)))
  return valid.at(-1)
}

export function priceTouchesZone(price: number, zone: PriceZone, tolerance = 0.0015) {
  const pad = price * tolerance
  return price >= zone.low - pad && price <= zone.high + pad
}

/** Crypto SMT: compare swing structure vs BTC at liquidity (TJR ES/NQ analogue). */
export function smtDivergence(primary: Candle[], reference: Candle[]): Direction | undefined {
  const pSwings = findTjrSwings(primary.slice(-60))
  const rSwings = findTjrSwings(reference.slice(-60))
  const pHighs = pSwings.filter((s) => s.type === 'high').map((s) => s.price)
  const rHighs = rSwings.filter((s) => s.type === 'high').map((s) => s.price)
  const pLows = pSwings.filter((s) => s.type === 'low').map((s) => s.price)
  const rLows = rSwings.filter((s) => s.type === 'low').map((s) => s.price)

  if (pHighs.length >= 2 && rHighs.length >= 2) {
    const pLowerHigh = pHighs.at(-1)! < pHighs.at(-2)!
    const rHigherHigh = rHighs.at(-1)! > rHighs.at(-2)!
    if (pLowerHigh && rHigherHigh) return 'bearish'
    const pHigherHigh = pHighs.at(-1)! > pHighs.at(-2)!
    const rLowerHigh = rHighs.at(-1)! < rHighs.at(-2)!
    if (pHigherHigh && rLowerHigh) return 'bullish'
  }
  if (pLows.length >= 2 && rLows.length >= 2) {
    const pLowerLow = pLows.at(-1)! < pLows.at(-2)!
    const rHigherLow = rLows.at(-1)! > rLows.at(-2)!
    if (pLowerLow && rHigherLow) return 'bullish'
    const pHigherLow = pLows.at(-1)! > pLows.at(-2)!
    const rLowerLow = rLows.at(-1)! < rLows.at(-2)!
    if (pHigherLow && rLowerLow) return 'bearish'
  }
  return undefined
}

export function structureSnapshot(candles: Candle[]) {
  const swings = findTjrSwings(candles)
  const trend = trendFromSwings(swings)
  const gaps = findFairValueGaps(candles)
  const sweep = recentLiquiditySweep(candles, swings)
  const bos = breakOfStructure(candles, swings)
  const inverse = recentInverseFvg(gaps, trend)
  const eq = equilibriumPrice(swings)
  const fvg = activeFairValueGap(gaps, trend)
  const price = candles.at(-1)?.close ?? 0
  return { swings, trend, gaps, sweep, bos, inverse, eq, fvg, price }
}

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

/** BOS: candle body closes beyond most recent swing (not wick only). */
export function breakOfStructure(candles: Candle[], swings: SwingPoint[], trend: Direction): Direction | undefined {
  const close = candles.at(-1)?.close ?? 0
  const highs = swings.filter((s) => s.type === 'high')
  const lows = swings.filter((s) => s.type === 'low')
  const lastHigh = highs.at(-1)?.price
  const lastLow = lows.at(-1)?.price

  if (trend === 'bullish' && lastLow !== undefined && close < lastLow) return 'bearish'
  if (trend === 'bearish' && lastHigh !== undefined && close > lastHigh) return 'bullish'
  if (trend === 'neutral') {
    if (lastHigh !== undefined && close > lastHigh) return 'bullish'
    if (lastLow !== undefined && close < lastLow) return 'bearish'
  }
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
  const bos = breakOfStructure(candles, swings, trend)
  const inverse = recentInverseFvg(gaps, trend)
  const eq = equilibriumPrice(swings)
  const fvg = activeFairValueGap(gaps, trend)
  const price = candles.at(-1)?.close ?? 0
  return { swings, trend, gaps, sweep, bos, inverse, eq, fvg, price }
}

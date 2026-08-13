import { describe, expect, it } from 'vitest'
import {
  findFairValueGaps,
  findFairValueGapStacks,
  permissiveInverseFvg,
  recentInverseFvg,
  type FairValueGap,
} from './tjr-structure'
import type { Candle } from './types'

const candle = (open: number, high: number, low: number, close: number, index: number): Candle => ({
  openTime: index * 60_000,
  open,
  high,
  low,
  close,
  volume: 1,
})

const gap = (
  bullish: boolean,
  index: number,
  low: number,
  high: number,
  invalidatedAt?: number,
  firstTouchAt?: number,
): FairValueGap => ({
  bullish,
  index,
  low,
  high,
  kind: 'fair-value-gap',
  disrespected: invalidatedAt !== undefined,
  invalidatedAt,
  firstTouchAt,
})

describe('TJR 2026 stacked iFVG', () => {
  it('rejects a partial bullish-stack inversion until the controlling lower gap closes', () => {
    const gaps = [
      gap(true, 3, 100, 101, 9),
      gap(true, 4, 102, 103, 8),
    ]

    expect(findFairValueGapStacks(gaps)).toHaveLength(1)
    expect(permissiveInverseFvg(gaps, 8)).toBe('bearish')
    expect(recentInverseFvg(gaps, 'bullish', 8)).toBeUndefined()
    expect(recentInverseFvg(gaps, 'bullish', 9)).toBe('bearish')
  })

  it('rejects a partial bearish-stack inversion until the controlling upper gap closes', () => {
    const gaps = [
      gap(false, 3, 104, 105, 8),
      gap(false, 4, 102, 103, 9),
    ]

    expect(findFairValueGapStacks(gaps)).toHaveLength(1)
    expect(recentInverseFvg(gaps, 'bearish', 8)).toBeUndefined()
    expect(recentInverseFvg(gaps, 'bearish', 9)).toBe('bullish')
  })

  it('does not invert a wick-only violation', () => {
    const candles = [
      candle(99, 100, 98, 99.5, 0),
      candle(99.5, 104, 99, 103, 1),
      candle(102, 104, 101, 103, 2),
      candle(102, 103, 99, 100.5, 3),
    ]
    const wickOnly = findFairValueGaps(candles).find((item) => item.index === 2)!
    expect(wickOnly.firstTouchAt).toBe(3)
    expect(wickOnly.disrespected).toBe(false)
    expect(recentInverseFvg([wickOnly], 'bullish', 3)).toBeUndefined()

    const closedThrough = findFairValueGaps([
      ...candles,
      candle(100.5, 101, 98, 99, 4),
    ]).find((item) => item.index === 2)!
    expect(closedThrough.invalidatedAt).toBe(4)
    expect(recentInverseFvg([closedThrough], 'bullish', 4)).toBe('bearish')
  })

  it('starts a new stack after the prior gap was retraced', () => {
    const gaps = [
      gap(true, 3, 100, 101, undefined, 4),
      gap(true, 5, 102, 103),
    ]
    expect(findFairValueGapStacks(gaps)).toHaveLength(2)
  })
})

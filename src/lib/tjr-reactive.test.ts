import { describe, expect, it } from 'vitest'
import {
  findTjrSwings,
  isReactiveSweep,
  latestConfirmationEvent,
  recentDrawLiquiditySweepDetailed,
  resolveControllingDrawHits,
  type DrawLevel,
} from './tjr-structure'
import type { Candle } from './types'

const c = (partial: Partial<Candle> & Pick<Candle, 'open' | 'high' | 'low' | 'close'>): Candle => ({
  openTime: partial.openTime ?? Date.now(),
  volume: partial.volume ?? 1,
  ...partial,
})

describe('reactive draw liquidity sweep', () => {
  it('classifies London L sweep as bullish hit with source london', () => {
    const candles: Candle[] = [
      c({ open: 10, high: 11, low: 9.5, close: 10.5 }),
      c({ open: 10.5, high: 10.8, low: 9.2, close: 9.4 }), // takes London L 9.3 then closes back
      c({ open: 9.4, high: 9.9, low: 9.3, close: 9.8 }),
    ]
    const draws: DrawLevel[] = [
      { price: 9.3, source: 'london', label: 'Londres L', kind: 'low' },
      { price: 12, source: 'asia', label: 'Ásia H', kind: 'high' },
    ]
    const hit = recentDrawLiquiditySweepDetailed(candles, draws, 10)
    expect(hit?.direction).toBe('bullish')
    expect(hit?.source).toBe('london')
    expect(hit?.label).toBe('Londres L')
    expect(hit?.kind).toBe('low')
    expect(hit?.candleIndex).toBe(1)
  })

  it('does not treat high-raid as bullish long sweep', () => {
    const candles: Candle[] = [
      c({ open: 10, high: 11, low: 9.8, close: 10.5 }),
      c({ open: 10.5, high: 12.2, low: 10.4, close: 10.6 }), // sweeps Asia H 12 then closes back
    ]
    const highs: DrawLevel[] = [{ price: 12, source: 'asia', label: 'Ásia H', kind: 'high' }]
    const lows: DrawLevel[] = [{ price: 9, source: 'london', label: 'Londres L', kind: 'low' }]
    expect(recentDrawLiquiditySweepDetailed(candles, highs, 10)?.direction).toBe('bearish')
    expect(recentDrawLiquiditySweepDetailed(candles, lows, 10)).toBeUndefined()
  })

  it('lets a fresher HIGH sweep replace a stale LOW sweep', () => {
    const candles = [
      c({ openTime: 1, open: 10, high: 10.2, low: 8.8, close: 9.4 }),
      c({ openTime: 2, open: 9.4, high: 12.2, low: 9.3, close: 10.6 }),
    ]
    const high = recentDrawLiquiditySweepDetailed(
      candles,
      [{ price: 12, source: 'asia', label: 'Ásia H', kind: 'high' }],
    )
    const low = recentDrawLiquiditySweepDetailed(
      candles,
      [{ price: 9, source: 'london', label: 'Londres L', kind: 'low' }],
    )

    expect(resolveControllingDrawHits(low, high)).toEqual({ opposed: high })
    expect(resolveControllingDrawHits(high, low)).toEqual({ aligned: high })
  })

  it('lets a fresher LOW sweep replace a stale HIGH sweep', () => {
    const candles = [
      c({ openTime: 1, open: 10, high: 12.2, low: 9.8, close: 10.5 }),
      c({ openTime: 2, open: 10.5, high: 10.8, low: 8.8, close: 9.4 }),
    ]
    const high = recentDrawLiquiditySweepDetailed(
      candles,
      [{ price: 12, source: 'asia', label: 'Ásia H', kind: 'high' }],
    )
    const low = recentDrawLiquiditySweepDetailed(
      candles,
      [{ price: 9, source: 'london', label: 'Londres L', kind: 'low' }],
    )

    expect(resolveControllingDrawHits(low, high)).toEqual({ aligned: low })
    expect(resolveControllingDrawHits(high, low)).toEqual({ opposed: low })
  })

  it('marks asia/london/prev_day as reactive for longs', () => {
    expect(isReactiveSweep('london', 'long', 'bullish')).toBe(true)
    expect(isReactiveSweep('asia', 'long', 'bullish')).toBe(true)
    expect(isReactiveSweep('prev_day', 'long', 'bullish')).toBe(true)
    expect(isReactiveSweep('newyork', 'long', 'bullish')).toBe(false)
    expect(isReactiveSweep('london', 'long', 'bearish')).toBe(false)
  })

  it('keeps TJR swing definition (up+down = high)', () => {
    const candles = [
      c({ open: 1, high: 2, low: 1, close: 1.8 }), // up
      c({ open: 1.8, high: 2.1, low: 1.5, close: 1.6 }), // down → high at 2.1
    ]
    const swings = findTjrSwings(candles)
    expect(swings.some((s) => s.type === 'high' && s.price === 2.1)).toBe(true)
  })
})

describe('confirmation after controlling sweep', () => {
  it('places BOS after an earlier sweep timestamp and rejects confirmation-before-sweep', () => {
    const candles = [
      c({ openTime: 0, open: 100, high: 103, low: 99, close: 102 }),
      c({ openTime: 1, open: 102, high: 104, low: 99, close: 100 }),
      c({ openTime: 2, open: 100, high: 101, low: 97, close: 98 }),
      c({ openTime: 3, open: 98, high: 101, low: 97, close: 100 }),
      c({ openTime: 4, open: 100, high: 102, low: 99, close: 101 }),
      c({ openTime: 5, open: 101, high: 102, low: 98, close: 99 }),
      c({ openTime: 6, open: 99, high: 106, low: 99, close: 105 }),
    ]
    const event = latestConfirmationEvent(candles)
    expect(event?.direction).toBe('bullish')
    expect(event?.openTime).toBe(6)
    expect(event!.openTime >= 3).toBe(true)
    expect(event!.openTime >= 7).toBe(false)
  })
})

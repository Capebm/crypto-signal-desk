import { describe, expect, it } from 'vitest'
import {
  findTjrSwings,
  isReactiveSweep,
  recentDrawLiquiditySweepDetailed,
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

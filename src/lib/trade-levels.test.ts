import { describe, expect, it } from 'vitest'
import { averageTrueRange, computeLongStop, computeStructuralStop } from './trade-levels'
import type { Candle } from './types'

const candles = (base: number, range: number): Candle[] => Array.from({ length: 16 }, (_, index) => ({
  openTime: index * 300_000,
  open: base,
  high: base + range / 2,
  low: base - range / 2,
  close: base,
  volume: 1,
}))

describe('computeLongStop', () => {
  it('enforces minimum 3.5% stop when structure is too tight', () => {
    const entry = 0.00211
    const rawStop = 0.00209081
    const stop = computeLongStop(entry, rawStop)
    const pct = ((entry - stop) / entry) * 100
    expect(pct).toBeGreaterThanOrEqual(3.4)
    expect(stop).toBeLessThan(entry)
  })

  it('never places stop above entry', () => {
    const stop = computeLongStop(0.00211, 0.0025)
    expect(stop).toBeLessThan(0.00211)
  })

  it('caps maximum risk at 8%', () => {
    const entry = 1
    const rawStop = 0.5
    const stop = computeLongStop(entry, rawStop)
    expect((entry - stop) / entry).toBeLessThanOrEqual(0.081)
  })

  it('uses a structural Forex swing with a small ATR buffer, not 3.5%', () => {
    const stop = computeStructuralStop({
      side: 'long',
      entry: 1.17,
      swingPrices: [1.166, 1.168],
      candles: candles(1.17, 0.002),
      instrumentKind: 'forex',
    })

    expect(averageTrueRange(candles(1.17, 0.002))).toBeCloseTo(0.002)
    expect(stop).toBeCloseTo(1.1657)
    expect((1.17 - stop!) / 1.17).toBeLessThan(0.01)
  })

  it('uses one ATR when no structural swing exists', () => {
    expect(computeStructuralStop({
      side: 'short',
      entry: 100,
      swingPrices: [],
      candles: candles(100, 2),
      instrumentKind: 'index',
    })).toBeCloseTo(102)
  })

  it('keeps the legacy percentage fallback only for Crypto without ATR', () => {
    const one = candles(1, 0.1).slice(0, 1)
    expect(computeStructuralStop({
      side: 'long',
      entry: 1,
      swingPrices: [],
      candles: one,
      instrumentKind: 'crypto',
    })).toBeCloseTo(0.965)
    expect(computeStructuralStop({
      side: 'long',
      entry: 1,
      swingPrices: [],
      candles: one,
      instrumentKind: 'forex',
    })).toBeUndefined()
  })
})

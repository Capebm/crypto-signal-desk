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
  it('widens micro-price stops to 6% so OCO is not 1 tick from entry', () => {
    const entry = 0.0026
    const stop = computeLongStop(entry, 0.0025)
    expect((entry - stop) / entry).toBeCloseTo(0.06)
    expect(stop).toBeCloseTo(0.002444)
  })

  it('enforces minimum 3.5% stop on typical crypto prices', () => {
    const entry = 0.05
    const rawStop = 0.049
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

  it('widens a 1m-noise Forex stop so EURJPY is not a 5-pip OCO', () => {
    const entry = 184.79
    const stop = computeStructuralStop({
      side: 'long',
      entry,
      swingPrices: [184.75, 184.76],
      candles: candles(entry, 0.02),
      instrumentKind: 'forex',
    })
    expect(stop).toBeDefined()
    expect((entry - stop!) / entry).toBeGreaterThanOrEqual(0.0015)
    expect(entry - stop!).toBeGreaterThan(0.2)
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

  it('clamps a Crypto structural stop to the micro-price band even with ATR', () => {
    const stop = computeStructuralStop({
      side: 'long',
      entry: 0.0026,
      swingPrices: [0.0025, 0.00255],
      candles: candles(0.0026, 0.00004),
      instrumentKind: 'crypto',
    })
    expect((0.0026 - stop!) / 0.0026).toBeCloseTo(0.06)
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

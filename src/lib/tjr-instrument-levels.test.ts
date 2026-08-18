import { describe, expect, it } from 'vitest'
import { averageTrueRange, buildTradeLevels } from './trade-levels'
import type { Candle } from './types'

const candles = (base: number, range: number): Candle[] => Array.from({ length: 16 }, (_, index) => ({
  openTime: index * 300_000,
  open: base,
  high: base + range / 2,
  low: base - range / 2,
  close: base,
  volume: 1,
}))

describe('instrument-aware structural levels', () => {
  it('keeps a Forex stop near the swing/ATR instead of 3.5%', () => {
    const exec = candles(1.17, 0.002)
    const plan = buildTradeLevels({
      side: 'long',
      entry: 1.17,
      swingPrices: [1.166, 1.168],
      candles: exec,
      instrumentKind: 'forex',
      candidates: [{ price: 1.176, priority: 2, label: 'Londres H' }],
      minRr: 1,
      fixedMultiple: 1.5,
    })

    expect(averageTrueRange(exec)).toBeCloseTo(0.002)
    expect((1.17 - plan.stop) / 1.17).toBeLessThan(0.01)
    expect(plan.levelsValid).toBe(true)
    expect(plan.headroomRr).toBeGreaterThanOrEqual(1)
  })

  it('scales a 1R EURJPY target off the widened stop, not 5 pips', () => {
    const entry = 184.79
    const plan = buildTradeLevels({
      side: 'long',
      entry,
      swingPrices: [184.75, 184.76],
      candles: candles(entry, 0.02),
      instrumentKind: 'forex',
      candidates: [{ price: 185.4, priority: 2, label: 'Londres H' }],
      minRr: 1,
      fixedMultiple: 1,
    })
    expect(entry - plan.stop).toBeGreaterThan(0.2)
    expect(plan.target - entry).toBeGreaterThan(0.2)
    expect(plan.riskReward).toBeCloseTo(1)
    expect(plan.levelsValid).toBe(true)
  })

  it('caps a fixed 1.5R target at the nearer GER40 liquidity draw', () => {
    const plan = buildTradeLevels({
      side: 'long',
      entry: 24_000,
      swingPrices: [23_940, 23_960],
      candles: candles(24_000, 40),
      instrumentKind: 'index',
      candidates: [{ price: 24_020, priority: 3, label: 'NY H' }],
      minRr: 1,
      fixedMultiple: 1.5,
    })

    expect(plan.target).toBe(24_020)
    expect(plan.targetLabel).toBe('NY H')
    expect(plan.riskReward).toBeLessThan(1.5)
  })

  it('rejects liquidez when the only draw is too close for GBPUSD', () => {
    const plan = buildTradeLevels({
      side: 'long',
      entry: 1.28,
      swingPrices: [1.276, 1.277],
      candles: candles(1.28, 0.0015),
      instrumentKind: 'forex',
      candidates: [{ price: 1.2808, priority: 2, label: 'Londres H' }],
      minRr: 1.2,
    })

    expect(plan.levelsValid).toBe(false)
    expect(plan.headroomRr).toBeLessThan(1.2)
  })

  it('keeps the Crypto percentage fallback only without ATR', () => {
    const one = candles(1, 0.1).slice(0, 1)
    const plan = buildTradeLevels({
      side: 'long',
      entry: 1,
      swingPrices: [],
      candles: one,
      instrumentKind: 'crypto',
      candidates: [{ price: 1.08, priority: 4, label: 'Dia ant. H' }],
      minRr: 1,
      fixedMultiple: 1,
    })
    expect(plan.stop).toBeCloseTo(0.965)
    expect(plan.levelsValid).toBe(true)
  })
})

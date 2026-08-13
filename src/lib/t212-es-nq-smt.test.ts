import { describe, expect, it } from 'vitest'
import { computeEsNqLiquiditySmt } from './t212-es-nq-smt'
import type { Candle } from './types'

const NOW = 1_800_000_000_000

const series = (
  base: number,
  highs: Record<number, number> = {},
  lows: Record<number, number> = {},
  timeShift = 0,
): Candle[] => Array.from({ length: 12 }, (_, index) => {
  const up = index % 2 === 0
  const open = base + (up ? 0 : 1)
  const close = base + (up ? 1 : 0.4)
  return {
    openTime: NOW - (11 - index) * 300_000 + timeShift,
    open,
    close,
    high: highs[index] ?? base + 2,
    low: lows[index] ?? base - 2,
    volume: 1,
  }
})

describe('computeEsNqLiquiditySmt', () => {
  it('detects bearish SMT when ES makes a higher high and NQ fails', () => {
    const es = series(100, { 9: 105, 11: 106 })
    const nq = series(200, { 9: 205, 11: 204 })
    const result = computeEsNqLiquiditySmt(es, nq, { now: NOW })
    expect(result.feedValid).toBe(true)
    expect(result.fresh).toBe(true)
    expect(result.direction).toBe('bearish')
    expect(result.kind).toBe('high')
  })

  it('detects bullish SMT when NQ makes a lower low and ES fails', () => {
    const es = series(100, {}, { 8: 95, 10: 96 })
    const nq = series(200, {}, { 8: 195, 10: 194 })
    const result = computeEsNqLiquiditySmt(es, nq, { now: NOW })
    expect(result.direction).toBe('bullish')
    expect(result.kind).toBe('low')
    expect(result.nqMadeExtreme).toBe(true)
  })

  it('stays neutral when both markets make the same new extreme', () => {
    const es = series(100, { 9: 105, 11: 106 })
    const nq = series(200, { 9: 205, 11: 206 })
    const result = computeEsNqLiquiditySmt(es, nq, { now: NOW })
    expect(result.feedValid).toBe(true)
    expect(result.direction).toBeUndefined()
  })

  it('rejects materially skewed or stale feeds', () => {
    const es = series(100)
    const skewed = series(200, {}, {}, 15 * 60_000)
    expect(computeEsNqLiquiditySmt(es, skewed, { now: NOW }).feedValid).toBe(false)
    expect(computeEsNqLiquiditySmt(es, series(200), { now: NOW + 20 * 60_000 }).feedValid).toBe(false)
  })
})

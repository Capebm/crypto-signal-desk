import { describe, expect, it } from 'vitest'
import {
  firstConfirmationAfterSweep,
  isStaleOpposedSweep,
  recentDrawLiquiditySweepDetailed,
  resolveControllingDrawHits,
  type DrawLevel,
} from './tjr-structure'
import { evaluateTjrQuick } from './tjr-engine'
import type { Candle } from './types'

const H = 3_600_000
const c = (openTime: number, open: number, high: number, low: number, close: number): Candle => ({
  openTime,
  open,
  high,
  low,
  close,
  volume: 1,
})

const ASIA_H: DrawLevel = { price: 100, source: 'asia', label: 'Ásia H', kind: 'high' }
const LONDON_L: DrawLevel = { price: 95, source: 'london', label: 'Londres L', kind: 'low' }

/** Dia ant. 12 Ago + Londres 13 Ago, para o motor usar PDH/PDL estáveis. */
const prevDaySeries = (kind: 'stale-high-fresh-low' | 'stale-low-fresh-high'): Candle[] => {
  const prevDay = Date.UTC(2026, 7, 12, 16, 0)
  const london = Date.UTC(2026, 7, 13, 8, 0)
  const candles: Candle[] = []
  for (let index = 0; index < 6; index += 1) {
    candles.push(c(
      prevDay + index * H,
      97,
      index === 2 ? 100 : 98.5,
      index === 4 ? 95 : 96.5,
      97.2,
    ))
  }
  const firstSweep = kind === 'stale-high-fresh-low'
    ? c(london, 99, 101, 98.5, 99.4)
    : c(london, 96, 97, 94.4, 96.6)
  const secondSweep = kind === 'stale-high-fresh-low'
    ? c(london + 6 * H, 96, 97, 94.4, 96.6)
    : c(london + 6 * H, 99, 101, 98.5, 99.4)
  candles.push(firstSweep)
  for (let index = 1; index < 6; index += 1) {
    candles.push(c(london + index * H, 97, 98, 96.2, 97))
  }
  candles.push(secondSweep)
  return candles
}

describe('crypto sweep lifecycle', () => {
  it('lets a stale HIGH yield to a fresher LOW', () => {
    const helper = [
      c(5 * H, 99, 101, 98.5, 99.5),
      c(35 * H, 96, 97, 94.5, 96.5),
    ]
    const aligned = recentDrawLiquiditySweepDetailed(helper, [LONDON_L])
    const opposed = recentDrawLiquiditySweepDetailed(helper, [ASIA_H])
    expect(aligned?.candleIndex).toBe(1)
    expect(opposed?.candleIndex).toBe(0)
    expect(resolveControllingDrawHits(aligned, opposed)).toEqual({ aligned })
    expect(isStaleOpposedSweep(aligned, opposed)).toBe(true)

    const candles = prevDaySeries('stale-high-fresh-low')
    const decision = evaluateTjrQuick('AAAUSDC', candles, candles, 'equilibrado', '1_5r', {
      sessionMarket: 'crypto',
      instrumentKind: 'crypto',
    }, 'long')
    expect(decision.opposedSweep).toBeFalsy()
    expect(decision.staleOpposed).toBe(true)
  })

  it('still blocks a long when the HIGH sweep is fresher', () => {
    const helper = [
      c(10 * H, 96, 97, 94.5, 96.5),
      c(35 * H, 99, 101, 98.5, 99.5),
    ]
    const aligned = recentDrawLiquiditySweepDetailed(helper, [LONDON_L])
    const opposed = recentDrawLiquiditySweepDetailed(helper, [ASIA_H])
    expect(resolveControllingDrawHits(aligned, opposed)).toEqual({ opposed })
    expect(isStaleOpposedSweep(aligned, opposed)).toBe(false)

    const candles = prevDaySeries('stale-low-fresh-high')
    const decision = evaluateTjrQuick('AAAUSDC', candles, candles, 'equilibrado', '1_5r', {
      sessionMarket: 'crypto',
      instrumentKind: 'crypto',
    }, 'long')
    expect(decision.opposedSweep).toBe(true)
    expect(decision.action).toBe('ESPERAR')
  })

  it('rejects confirmation that happened before the controlling sweep', () => {
    const candles = [
      c(0, 100, 103, 99, 102),
      c(H, 102, 104, 99, 100),
      c(2 * H, 100, 101, 97, 98),
      c(3 * H, 98, 101, 97, 100),
      c(4 * H, 100, 102, 99, 101),
      c(5 * H, 101, 102, 98, 99),
      c(6 * H, 99, 106, 99, 105),
      c(7 * H, 105, 105.4, 104.6, 105),
      c(8 * H, 105, 105.2, 94.5, 96.5),
    ]
    const before = firstConfirmationAfterSweep(candles, { openTime: 0 }, 'long')
    const afterSweep = firstConfirmationAfterSweep(candles, { openTime: 8 * H }, 'long')
    expect(before?.direction).toBe('bullish')
    expect(afterSweep).toBeUndefined()
  })

  it('rejects a BOS that arrives too long after the sweep', () => {
    const candles = [
      c(0, 100, 103, 99, 102),
      c(H, 102, 104, 99, 100),
      c(2 * H, 100, 101, 97, 98),
      c(3 * H, 98, 101, 97, 100),
      c(4 * H, 100, 102, 99, 101),
      c(5 * H, 101, 102, 98, 99),
      c(6 * H, 99, 106, 99, 105),
    ]
    expect(firstConfirmationAfterSweep(candles, { openTime: 0 }, 'long', { maxBars: 12 })?.openTime).toBe(6 * H)
    expect(firstConfirmationAfterSweep(candles, { openTime: 0 }, 'long', { maxBars: 3 })).toBeUndefined()
  })

  it('marks Prático/Malha as softOpposed when the opposed sweep is stale', () => {
    const candles = prevDaySeries('stale-high-fresh-low')
    const decision = evaluateTjrQuick('AAAUSDC', candles, candles, 'agressivo', '1_5r', {
      sessionMarket: 'crypto',
      instrumentKind: 'crypto',
      wideNet: true,
    }, 'long')
    expect(decision.opposedSweep).toBeFalsy()
    expect(decision.staleOpposed).toBe(true)
    expect(decision.softOpposed).toBe(true)
    expect(decision.entryTiming).not.toBe('AGORA')
  })
})

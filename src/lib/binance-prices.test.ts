import { describe, expect, it } from 'vitest'
import { binancePriceCopy, binanceStopLimitCopy, stopLimitBelowTrigger } from './binance-prices'

describe('binance OCO prices', () => {
  it('SL limit is strictly below trigger for micro-cap prices', () => {
    for (const stop of [0.00211, 0.00209, 0.00195, 0.00203615, 0.00332, 0.00535]) {
      expect(stopLimitBelowTrigger(stop)).toBe(true)
      expect(binanceStopLimitCopy(stop)).not.toBe(binancePriceCopy(stop))
    }
  })

  it('TOWNS pre-fix case: 0.00209 trigger → 0.00208 limit', () => {
    expect(binancePriceCopy(0.00209081)).toBe('0.00209')
    expect(binanceStopLimitCopy(0.00209081)).toBe('0.00208')
  })

  it('post-fix 3.5% stop rounds but limit stays below trigger', () => {
    const stop = 0.00203615
    expect(binancePriceCopy(stop)).toBe('0.00204')
    expect(binanceStopLimitCopy(stop)).toBe('0.00203')
    expect(stopLimitBelowTrigger(stop)).toBe(true)
  })
})

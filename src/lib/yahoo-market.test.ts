import { describe, expect, it } from 'vitest'
import { aggregateTo4h, parseYahooChart, T212_TWELVE_SYMBOL } from './yahoo-market'

describe('yahoo-market', () => {
  it('parses yahoo chart payload into candles', () => {
    const candles = parseYahooChart({
      chart: {
        result: [{
          timestamp: [1_700_000_000, 1_700_003_600],
          indicators: {
            quote: [{
              open: [100, 101],
              high: [102, 103],
              low: [99, 100],
              close: [101, 102],
              volume: [10, 12],
            }],
          },
        }],
      },
    })
    expect(candles).toHaveLength(2)
    expect(candles[0]).toMatchObject({ open: 100, close: 101, volume: 10 })
    expect(candles[0].openTime).toBe(1_700_000_000_000)
  })

  it('aggregates hourly candles into 4h', () => {
    const base = Date.UTC(2026, 0, 1, 0, 0, 0)
    const hourly = [0, 1, 2, 3, 4].map((h) => ({
      openTime: base + h * 3_600_000,
      open: 10 + h,
      high: 11 + h,
      low: 9 + h,
      close: 10.5 + h,
      volume: 1,
    }))
    const four = aggregateTo4h(hourly)
    expect(four.length).toBeGreaterThanOrEqual(2)
    expect(four[0].open).toBe(10)
    expect(four[0].close).toBe(13.5)
  })

  it('uses verified Twelve commodity symbols and excludes ambiguous futures tickers', () => {
    expect(T212_TWELVE_SYMBOL).toMatchObject({
      oil: 'WTI/USD',
      brent: 'XBR/USD',
      copper: 'HG1',
      xauusd: 'XAU/USD',
      xagusd: 'XAG/USD',
      platinum: 'XPT/USD',
      dot: 'PDOTN/USD',
    })
    for (const id of ['ngas', 'es', 'nq', 'ym', 'rty']) {
      expect(T212_TWELVE_SYMBOL[id]).toBeUndefined()
    }
  })
})

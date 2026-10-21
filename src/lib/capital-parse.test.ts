import { describe, expect, it } from 'vitest'
import { parseCapitalPrices } from '../../server/capital'

describe('parseCapitalPrices', () => {
  it('uses the bid/ask mid, UTC times and sorts ascending', () => {
    const candles = parseCapitalPrices([
      { snapshotTimeUTC: '2026-10-08T07:01:00', openPrice: { bid: 10, ask: 12 }, highPrice: { bid: 14, ask: 16 }, lowPrice: { bid: 8, ask: 10 }, closePrice: { bid: 12, ask: 14 }, lastTradedVolume: 5 },
      { snapshotTimeUTC: '2026-10-08T07:00:00', openPrice: { bid: 1, ask: 3 }, highPrice: { bid: 3, ask: 5 }, lowPrice: { bid: 0, ask: 2 }, closePrice: { bid: 2, ask: 4 } },
      { snapshotTimeUTC: 'lixo', openPrice: { bid: 1, ask: 1 } },
    ])
    expect(candles).toEqual([
      { openTime: Date.UTC(2026, 9, 8, 7, 0), open: 2, high: 4, low: 1, close: 3, volume: 0 },
      { openTime: Date.UTC(2026, 9, 8, 7, 1), open: 11, high: 15, low: 9, close: 13, volume: 5 },
    ])
  })
})

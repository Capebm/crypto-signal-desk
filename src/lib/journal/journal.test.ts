import { describe, expect, it } from 'vitest'
import { parseBinanceCsv } from './binance-csv'
import { buildClosedTrades } from './round-trips'
import { computeJournalStats } from './journal-stats'

const sampleCsv = `Date(UTC),Market,Type,Side,Price,Amount,Total,Fee,Fee Coin
2026-07-14 13:16:02,TOWNSUSDC,MARKET,BUY,0.00211,9478,19.99858,0.00002,BNB
2026-07-14 13:22:10,TOWNSUSDC,MARKET,SELL,0.00208,9478,19.71424,0.00002,BNB
2026-07-14 13:51:30,TOWNSUSDC,MARKET,BUY,0.00203,9852,19.99956,0.00002,BNB
`

const orderHistoryCsv = `Date(UTC),Order No.,Pair,Type,Side,Order Price,Order Amount,AvgTrading Price,Filled,Total,Status
2026-07-14 13:16:02,1,TOWNSUSDC,MARKET,BUY,0,9478,0.00211,9478,19.99858,FILLED
2026-07-14 13:22:10,2,TOWNSUSDC,MARKET,SELL,0,9478,0.00208,9478,19.71424,FILLED
2026-07-14 13:51:30,3,TOWNSUSDC,MARKET,BUY,0,9852,0.00203,9852,19.99956,FILLED
`

const dataDownloadCsv = `"Date(UTC)","Order No.","Pair","Type","Side","Average Price","Executed Quantity","Total","Status"
"2026-07-14 13:51:30","123","TOWNS/USDC","MARKET","BUY","0.00203","9852","19.99956","FILLED"
`

describe('parseBinanceCsv', () => {
  it('parses standard Binance spot trade export', () => {
    const fills = parseBinanceCsv(sampleCsv)
    expect(fills).toHaveLength(3)
    expect(fills[0].side).toBe('BUY')
    expect(fills[0].symbol).toBe('TOWNSUSDC')
    expect(fills[0].quantity).toBe(9478)
  })

  it('parses Spot Order History export from Data Download Center', () => {
    const fills = parseBinanceCsv(orderHistoryCsv)
    expect(fills).toHaveLength(3)
    expect(fills[2].price).toBe(0.00203)
  })

  it('parses Average Price / Executed Quantity column names', () => {
    const fills = parseBinanceCsv(dataDownloadCsv)
    expect(fills).toHaveLength(1)
    expect(fills[0].symbol).toBe('TOWNSUSDC')
    expect(fills[0].quantity).toBe(9852)
  })
})

describe('buildClosedTrades', () => {
  it('matches FIFO buy then sell round-trips', () => {
    const fills = parseBinanceCsv(sampleCsv)
    const trades = buildClosedTrades(fills)
    expect(trades).toHaveLength(1)
    expect(trades[0].base).toBe('TOWNS')
    expect(trades[0].quantity).toBe(9478)
    expect(trades[0].pnlUsdc).toBeLessThan(0)
    expect(trades[0].entrySession).toBeDefined()
  })
})

describe('computeJournalStats', () => {
  it('aggregates win rate and by-day pnl', () => {
    const fills = parseBinanceCsv(sampleCsv)
    const trades = buildClosedTrades(fills)
    const stats = computeJournalStats(trades)
    expect(stats.totalTrades).toBe(1)
    expect(stats.losses).toBe(1)
    expect(stats.winRate).toBe(0)
    expect(Object.keys(stats.byDay).length).toBeGreaterThan(0)
  })
})

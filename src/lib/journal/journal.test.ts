import { describe, expect, it } from 'vitest'
import { parseBinanceCsv } from './binance-csv'
import { buildClosedTrades, collapseFifoFills } from './round-trips'
import { computeJournalStats } from './journal-stats'
import type { ClosedTrade } from './types'

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

const binanceAppCsv = `Time,OrderNo,Pair,Type¹,Side,Order Price,Order Amount,Time,Executed²,Average Price,Trading total³,Status
2026-07-15 18:37:22,3503782180,XRPUSDC,MARKET,BUY,0,17.9XRP,2026-07-15 18:37:22,17.9XRP,1.1149,19.95671USDC,Filled,
2026-07-14 13:51:30,43987008,TOWNSUSDC,MARKET,BUY,0,9852TOWNS,2026-07-14 13:51:30,9852TOWNS,0.00203,19.99956USDC,Filled,
2026-07-14 13:18:34,43982363,TOWNSUSDC,STOP_LOSS_LIMIT,SELL,0.00208,9478TOWNS,2026-07-14 13:22:10,9478TOWNS,0.00208,19.71424USDC,Filled,
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

  it('parses Binance mobile/app order history export with asset suffixes', () => {
    const fills = parseBinanceCsv(binanceAppCsv)
    expect(fills).toHaveLength(3)
    const xrp = fills.find((fill) => fill.symbol === 'XRPUSDC')
    expect(xrp?.quantity).toBe(17.9)
    const townsBuy = fills.find((fill) => fill.symbol === 'TOWNSUSDC' && fill.side === 'BUY')
    expect(townsBuy?.price).toBe(0.00203)
    const townsSell = fills.find((fill) => fill.symbol === 'TOWNSUSDC' && fill.side === 'SELL')
    expect(townsSell?.side).toBe('SELL')
  })

  it('uses stable ids so reimport does not create twin fills', () => {
    const spotTradeHistory = `Time,Pair,Side,Price,Executed,Amount,Fee
2026-07-22 23:35:50,CVXUSDC,SELL,1.238,83.193CVX,102.992934USDC,0.00012867BNB
2026-07-22 16:02:51,CVXUSDC,BUY,1.284,83.193CVX,106.819812USDC,0.00013311BNB
`
    const a = parseBinanceCsv(spotTradeHistory)
    const b = parseBinanceCsv(spotTradeHistory)
    expect(a).toHaveLength(2)
    expect(a.map((f) => f.id).sort()).toEqual(b.map((f) => f.id).sort())
    expect(a[0].feeAsset).toBe('BNB')
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
    expect(stats.dayWinRate).toBe(0)
    expect(stats.equityCurve.length).toBe(1)
    expect(trades[0].venue).toBe('spot')
    expect(trades[0].side).toBe('long')
    expect(stats.spotPnl).toBe(trades[0].pnlUsdc)
    expect(stats.t212Pnl).toBe(0)
  })

  it('tracks drawdown, streaks, fees and expectancy', () => {
    const t = (id: string, pnl: number, exit: number, extra: Partial<ClosedTrade> = {}): ClosedTrade => ({
      id,
      symbol: 'XRPUSDC',
      base: 'XRP',
      entryTime: exit - 3_600_000,
      exitTime: exit,
      entryPrice: 1,
      exitPrice: 1,
      quantity: 1,
      pnlUsdc: pnl,
      pnlPct: pnl,
      feesUsdc: 0.1,
      entrySession: 'ny',
      entrySessionBadge: '',
      exitSession: 'ny',
      exitSessionBadge: '',
      durationMs: 3_600_000,
      venue: 'spot',
      side: 'long',
      ...extra,
    })
    const stats = computeJournalStats([
      t('a', 10, 1_000),
      t('b', 5, 2_000),
      t('c', -8, 3_000),
      t('d', -3, 4_000, { venue: 't212', side: 'short', feesUsdc: 0.4 }),
    ])
    expect(stats.maxDrawdown).toBeCloseTo(11, 6)
    expect(stats.maxWinStreak).toBe(2)
    expect(stats.maxLossStreak).toBe(2)
    expect(stats.expectancy).toBeCloseTo(4 / 4, 6)
    expect(stats.totalFees).toBeCloseTo(0.7, 6)
    expect(stats.spotPnl).toBe(7)
    expect(stats.t212Pnl).toBe(-3)
    expect(stats.bySide.Long.trades).toBe(3)
    expect(stats.bySide.Short.trades).toBe(1)
    expect(stats.byDuration['1–4 h']?.trades).toBe(4)
    expect(stats.bestTrade?.id).toBe('a')
    expect(stats.worstTrade?.id).toBe('c')
  })
})

describe('collapseFifoFills', () => {
  it('merges spot legs that share the same sell timestamp', () => {
    const csv = `Date(UTC),Market,Type,Side,Price,Amount,Total,Fee,Fee Coin
2026-07-14 13:16:02,XRPUSDC,MARKET,BUY,2.00,10,20,0,USDC
2026-07-14 13:20:00,XRPUSDC,MARKET,BUY,2.10,10,21,0,USDC
2026-07-14 13:30:00,XRPUSDC,MARKET,SELL,2.20,20,44,0,USDC
`
    const legs = buildClosedTrades(parseBinanceCsv(csv))
    expect(legs).toHaveLength(2)
    const trades = collapseFifoFills(legs)
    expect(trades).toHaveLength(1)
    expect(trades[0].quantity).toBe(20)
    expect(trades[0].pnlUsdc).toBeCloseTo(legs[0].pnlUsdc + legs[1].pnlUsdc, 8)
    expect(trades[0].entryPrice).toBeCloseTo(2.05, 8)
  })
})

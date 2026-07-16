import { describe, expect, it } from 'vitest'
import { dayId, pnlForDay } from './journal-stats'
import { buildClosedTrades } from './round-trips'
import type { BinanceFill } from './types'
import type { ManualClosedTradeInput } from './trade-store'

/** Mirror of addManualClosedTrade fill construction — pure, no localStorage. */
function manualFills(input: ManualClosedTradeInput): BinanceFill[] {
  const symbol = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const entryTime = Math.min(input.entryTime, input.exitTime)
  const exitTime = Math.max(input.entryTime, input.exitTime)
  const fee = input.feesUsdc && input.feesUsdc > 0 ? input.feesUsdc / 2 : undefined
  const stamp = 1
  return [
    {
      id: `manual-buy-${symbol}-${entryTime}-${stamp}`,
      time: entryTime,
      symbol,
      side: 'BUY',
      price: input.entryPrice,
      quantity: input.quantity,
      quoteAmount: input.entryPrice * input.quantity,
      fee,
      feeAsset: fee !== undefined ? 'USDC' : undefined,
    },
    {
      id: `manual-sell-${symbol}-${exitTime}-${stamp}`,
      time: exitTime,
      symbol,
      side: 'SELL',
      price: input.exitPrice,
      quantity: input.quantity,
      quoteAmount: input.exitPrice * input.quantity,
      fee,
      feeAsset: fee !== undefined ? 'USDC' : undefined,
    },
  ]
}

describe('manual closed trade fills → FIFO', () => {
  it('creates a closed Spot round-trip with correct PnL (RE-style)', () => {
    const entry = 0.5145
    const exit = 0.532
    const qty = 38.8
    const now = Date.UTC(2026, 6, 16, 14, 41, 0)
    const trades = buildClosedTrades(manualFills({
      symbol: 'REUSDC',
      entryPrice: entry,
      exitPrice: exit,
      quantity: qty,
      entryTime: now,
      exitTime: now + 60_000,
    }))
    expect(trades).toHaveLength(1)
    const expected = (exit - entry) * qty
    expect(trades[0].pnlUsdc).toBeCloseTo(expected, 3)
    expect(trades[0].pnlPct).toBeCloseTo(((exit - entry) / entry) * 100, 2)
  })

  it('aggregates pnlForDay on exit day', () => {
    const exitTime = Date.UTC(2026, 6, 16, 16, 0, 0)
    const trades = buildClosedTrades(manualFills({
      symbol: 'REUSDC',
      entryPrice: 0.5,
      exitPrice: 0.52,
      quantity: 20,
      entryTime: exitTime - 3_600_000,
      exitTime,
    }))
    const day = dayId(exitTime)
    const { pnl, trades: count } = pnlForDay(trades, day)
    expect(count).toBe(1)
    expect(pnl).toBeCloseTo(0.4, 5)
  })
})

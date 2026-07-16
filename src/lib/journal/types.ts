import type { SessionWindow } from '../trading-session'

export type BinanceFill = {
  id: string
  time: number
  symbol: string
  side: 'BUY' | 'SELL'
  price: number
  quantity: number
  quoteAmount: number
  fee?: number
  feeAsset?: string
}

export type ClosedTrade = {
  id: string
  symbol: string
  base: string
  entryTime: number
  exitTime: number
  entryPrice: number
  exitPrice: number
  quantity: number
  pnlUsdc: number
  pnlPct: number
  feesUsdc: number
  entrySession: SessionWindow
  entrySessionBadge: string
  exitSession: SessionWindow
  exitSessionBadge: string
  durationMs: number
}

export type JournalStore = {
  fills: BinanceFill[]
  dayNotes: Record<string, string>
  lastImportAt?: string
  lastImportRows?: number
}

export type SymbolStats = { trades: number; pnl: number; wins: number }
export type SessionStats = { trades: number; pnl: number; wins: number }
export type DayStats = { pnl: number; trades: number; wins: number }

export type JournalStats = {
  totalTrades: number
  wins: number
  losses: number
  breakeven: number
  winRate: number
  totalPnlUsdc: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  bestTrade: ClosedTrade | null
  worstTrade: ClosedTrade | null
  bySymbol: Record<string, SymbolStats>
  bySession: Partial<Record<SessionWindow, SessionStats>>
  byDay: Record<string, DayStats>
}

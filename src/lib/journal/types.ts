import type { TradeSignalMeta } from '../trade-signal-meta'
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
  /** Snapshot do Agente na entrada (quando registado via Fechou / meta). */
  signal?: TradeSignalMeta
}

export type JournalStore = {
  fills: BinanceFill[]
  dayNotes: Record<string, string>
  /** Meta de sinal indexada por ClosedTrade.id */
  signalByTradeId?: Record<string, TradeSignalMeta>
  lastImportAt?: string
  lastImportRows?: number
}

export type SymbolStats = { trades: number; pnl: number; wins: number }
export type SessionStats = { trades: number; pnl: number; wins: number }
export type DayStats = { pnl: number; trades: number; wins: number }
export type BucketStats = { trades: number; pnl: number; wins: number }

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
  /** Só trades com signal meta. */
  signalTrades: number
  byProfile: Record<string, BucketStats>
  byMesh: Record<string, BucketStats>
}

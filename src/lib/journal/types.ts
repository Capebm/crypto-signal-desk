import type { TradeSignalMeta } from '../trade-signal-meta'
import type { SessionWindow } from '../trading-session'
import type { T212Execution } from './t212-statement'

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

export type TradeVenue = 'spot' | 't212'

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
  /** Spot Binance vs CFD T212. */
  venue: TradeVenue
  /** Snapshot do Agente/T212 na entrada (quando registado via Fechou / meta). */
  signal?: TradeSignalMeta
}

export type JournalStore = {
  fills: BinanceFill[]
  dayNotes: Record<string, string>
  /** Meta de sinal indexada por ClosedTrade.id */
  signalByTradeId?: Record<string, TradeSignalMeta>
  /** Venue por trade (default spot se ausente). */
  venueByTradeId?: Record<string, TradeVenue>
  /**
   * Ledger T212: todas as execuções importadas de Activity Statements.
   * Os trades fechados (externalTrades) são reconstruídos a partir daqui.
   */
  t212Executions?: T212Execution[]
  /** Trades fechados T212 (derivados do ledger) + outros externos. */
  externalTrades?: ClosedTrade[]
  /** Snapshot das pernas ainda abertas após o último rebuild T212. */
  t212OpenExecutions?: T212Execution[]
  lastImportAt?: string
  lastImportRows?: number
  lastT212ImportAt?: string
}

/** Backup JSON versionado — export/import entre browsers. */
export type JournalBackup = {
  version: 1
  exportedAt: string
  store: JournalStore
}

export type SymbolStats = { trades: number; pnl: number; wins: number }
export type SessionStats = { trades: number; pnl: number; wins: number }
export type DayStats = { pnl: number; trades: number; wins: number }
export type BucketStats = { trades: number; pnl: number; wins: number }

export type EquityPoint = { t: number; equity: number; dayKey: string }

export type JournalStats = {
  totalTrades: number
  wins: number
  losses: number
  breakeven: number
  winRate: number
  /** % de dias com PnL > 0 (entre dias com pelo menos 1 trade). */
  dayWinRate: number
  tradingDays: number
  greenDays: number
  totalPnlUsdc: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  /** avgWin / avgLoss (0 se sem losses). */
  avgWinLossRatio: number
  bestTrade: ClosedTrade | null
  worstTrade: ClosedTrade | null
  bySymbol: Record<string, SymbolStats>
  bySession: Partial<Record<SessionWindow, SessionStats>>
  byDay: Record<string, DayStats>
  byVenue: Record<string, BucketStats>
  equityCurve: EquityPoint[]
  /** Só trades com signal meta. */
  signalTrades: number
  byProfile: Record<string, BucketStats>
  byTpMode: Record<string, BucketStats>
  byMesh: Record<string, BucketStats>
}

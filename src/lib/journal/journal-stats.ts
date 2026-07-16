import type { ClosedTrade, DayStats, JournalStats, SessionStats, SymbolStats } from './types'

export function computeJournalStats(trades: ClosedTrade[]): JournalStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      totalPnlUsdc: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: null,
      worstTrade: null,
      bySymbol: {},
      bySession: {},
      byDay: {},
    }
  }

  let wins = 0
  let losses = 0
  let breakeven = 0
  let grossWin = 0
  let grossLoss = 0
  let totalPnlUsdc = 0
  let bestTrade = trades[0]
  let worstTrade = trades[0]
  const bySymbol: Record<string, SymbolStats> = {}
  const bySession: JournalStats['bySession'] = {}
  const byDay: Record<string, DayStats> = {}

  for (const trade of trades) {
    totalPnlUsdc += trade.pnlUsdc

    if (trade.pnlUsdc > 0.001) {
      wins += 1
      grossWin += trade.pnlUsdc
    } else if (trade.pnlUsdc < -0.001) {
      losses += 1
      grossLoss += Math.abs(trade.pnlUsdc)
    } else {
      breakeven += 1
    }

    if (trade.pnlUsdc > bestTrade.pnlUsdc) bestTrade = trade
    if (trade.pnlUsdc < worstTrade.pnlUsdc) worstTrade = trade

    const symbolStats = bySymbol[trade.base] ?? { trades: 0, pnl: 0, wins: 0 }
    symbolStats.trades += 1
    symbolStats.pnl += trade.pnlUsdc
    if (trade.pnlUsdc > 0) symbolStats.wins += 1
    bySymbol[trade.base] = symbolStats

    const sessionStats = bySession[trade.entrySession] ?? { trades: 0, pnl: 0, wins: 0 }
    sessionStats.trades += 1
    sessionStats.pnl += trade.pnlUsdc
    if (trade.pnlUsdc > 0) sessionStats.wins += 1
    bySession[trade.entrySession] = sessionStats

    const dayKey = dayId(trade.exitTime)
    const dayStats = byDay[dayKey] ?? { pnl: 0, trades: 0, wins: 0 }
    dayStats.pnl += trade.pnlUsdc
    dayStats.trades += 1
    if (trade.pnlUsdc > 0) dayStats.wins += 1
    byDay[dayKey] = dayStats
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    breakeven,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    totalPnlUsdc,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin: wins > 0 ? grossWin / wins : 0,
    avgLoss: losses > 0 ? grossLoss / losses : 0,
    bestTrade,
    worstTrade,
    bySymbol,
    bySession,
    byDay,
  }
}

export function dayId(timestamp: number): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`
  return `${(ms / 86_400_000).toFixed(1)}d`
}

/** PnL do dia civil (UTC date key via dayId) — soma exits nesse dia. */
export function pnlForDay(trades: ClosedTrade[], dayKey: string): { pnl: number; trades: number } {
  const day = trades.filter((trade) => dayId(trade.exitTime) === dayKey)
  return {
    pnl: day.reduce((sum, trade) => sum + trade.pnlUsdc, 0),
    trades: day.length,
  }
}

export function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  )
}

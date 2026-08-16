import type { BucketStats, ClosedTrade, DayStats, EquityPoint, JournalStats, SessionStats, SymbolStats } from './types'

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

export const DURATION_BUCKETS = ['< 15 min', '15–60 min', '1–4 h', '4–24 h', '> 1 dia'] as const

const bump = (map: Record<string, BucketStats>, key: string, trade: ClosedTrade) => {
  const row = map[key] ?? { trades: 0, pnl: 0, wins: 0 }
  row.trades += 1
  row.pnl += trade.pnlUsdc
  if (trade.pnlUsdc > 0) row.wins += 1
  map[key] = row
}

const emptyStats = (): JournalStats => ({
  totalTrades: 0,
  wins: 0,
  losses: 0,
  breakeven: 0,
  winRate: 0,
  dayWinRate: 0,
  tradingDays: 0,
  greenDays: 0,
  totalPnlUsdc: 0,
  profitFactor: 0,
  avgWin: 0,
  avgLoss: 0,
  avgWinLossRatio: 0,
  expectancy: 0,
  totalFees: 0,
  maxDrawdown: 0,
  maxWinStreak: 0,
  maxLossStreak: 0,
  spotPnl: 0,
  t212Pnl: 0,
  spotFees: 0,
  t212Fees: 0,
  bestTrade: null,
  worstTrade: null,
  bySymbol: {},
  bySession: {},
  byDay: {},
  byVenue: {},
  bySide: {},
  byWeekday: {},
  byHour: {},
  byDuration: {},
  equityCurve: [],
  signalTrades: 0,
  byProfile: {},
  byTpMode: {},
  byMesh: {},
})

export function durationBucket(ms: number): (typeof DURATION_BUCKETS)[number] {
  if (ms < 15 * 60_000) return '< 15 min'
  if (ms < 60 * 60_000) return '15–60 min'
  if (ms < 4 * 3_600_000) return '1–4 h'
  if (ms < 24 * 3_600_000) return '4–24 h'
  return '> 1 dia'
}

export function computeJournalStats(trades: ClosedTrade[]): JournalStats {
  if (trades.length === 0) return emptyStats()

  let wins = 0
  let losses = 0
  let breakeven = 0
  let grossWin = 0
  let grossLoss = 0
  let totalPnlUsdc = 0
  let totalFees = 0
  let signalTrades = 0
  let spotPnl = 0
  let t212Pnl = 0
  let spotFees = 0
  let t212Fees = 0
  let bestTrade = trades[0]
  let worstTrade = trades[0]
  const bySymbol: Record<string, SymbolStats> = {}
  const bySession: JournalStats['bySession'] = {}
  const byDay: Record<string, DayStats> = {}
  const byVenue: Record<string, BucketStats> = {}
  const bySide: Record<string, BucketStats> = {}
  const byWeekday: Record<string, BucketStats> = {}
  const byHour: Record<string, BucketStats> = {}
  const byDuration: Record<string, BucketStats> = {}
  const byProfile: Record<string, BucketStats> = {}
  const byTpMode: Record<string, BucketStats> = {}
  const byMesh: Record<string, BucketStats> = {}

  const chronological = [...trades].sort((a, b) => a.exitTime - b.exitTime)
  const equityCurve: EquityPoint[] = []
  let equity = 0
  let peak = 0
  let maxDrawdown = 0
  let winStreak = 0
  let lossStreak = 0
  let maxWinStreak = 0
  let maxLossStreak = 0

  for (const trade of chronological) {
    totalPnlUsdc += trade.pnlUsdc
    totalFees += trade.feesUsdc
    equity += trade.pnlUsdc
    if (equity > peak) peak = equity
    const drawdown = peak - equity
    if (drawdown > maxDrawdown) maxDrawdown = drawdown
    equityCurve.push({ t: trade.exitTime, equity, dayKey: dayId(trade.exitTime) })

    if (trade.pnlUsdc > 0.001) {
      wins += 1
      grossWin += trade.pnlUsdc
      winStreak += 1
      lossStreak = 0
      if (winStreak > maxWinStreak) maxWinStreak = winStreak
    } else if (trade.pnlUsdc < -0.001) {
      losses += 1
      grossLoss += Math.abs(trade.pnlUsdc)
      lossStreak += 1
      winStreak = 0
      if (lossStreak > maxLossStreak) maxLossStreak = lossStreak
    } else {
      breakeven += 1
    }

    if (trade.pnlUsdc > bestTrade.pnlUsdc) bestTrade = trade
    if (trade.pnlUsdc < worstTrade.pnlUsdc) worstTrade = trade

    if (trade.venue === 't212') {
      t212Pnl += trade.pnlUsdc
      t212Fees += trade.feesUsdc
    } else {
      spotPnl += trade.pnlUsdc
      spotFees += trade.feesUsdc
    }

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

    bump(byVenue, trade.venue === 't212' ? 'T212' : 'Spot', trade)
    bump(bySide, trade.side === 'short' ? 'Short' : 'Long', trade)
    bump(byWeekday, WEEKDAY_LABELS[new Date(trade.exitTime).getDay()] ?? '—', trade)
    bump(byHour, `${String(new Date(trade.entryTime).getHours()).padStart(2, '0')}h`, trade)
    bump(byDuration, durationBucket(trade.durationMs), trade)

    if (trade.signal) {
      signalTrades += 1
      bump(byProfile, trade.signal.riskProfile, trade)
      bump(byTpMode, trade.signal.tpMode, trade)
      const meshKey = trade.signal.softOpposed || trade.signal.wideNet
        ? 'Com malha / aviso'
        : trade.signal.riskyHighLong
          ? 'Long após H'
          : 'Setup clássico'
      bump(byMesh, meshKey, trade)
    }
  }

  const dayEntries = Object.values(byDay)
  const greenDays = dayEntries.filter((d) => d.pnl > 0.001).length
  const tradingDays = dayEntries.length
  const avgWin = wins > 0 ? grossWin / wins : 0
  const avgLoss = losses > 0 ? grossLoss / losses : 0

  return {
    totalTrades: trades.length,
    wins,
    losses,
    breakeven,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    dayWinRate: tradingDays > 0 ? (greenDays / tradingDays) * 100 : 0,
    tradingDays,
    greenDays,
    totalPnlUsdc,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin,
    avgLoss,
    avgWinLossRatio: avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    expectancy: trades.length > 0 ? totalPnlUsdc / trades.length : 0,
    totalFees,
    maxDrawdown,
    maxWinStreak,
    maxLossStreak,
    spotPnl,
    t212Pnl,
    spotFees,
    t212Fees,
    bestTrade,
    worstTrade,
    bySymbol,
    bySession,
    byDay,
    byVenue,
    bySide,
    byWeekday,
    byHour,
    byDuration,
    equityCurve,
    signalTrades,
    byProfile,
    byTpMode,
    byMesh,
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

/** Stats semanais do mês (para sidebar tipo TradeZella). */
export function weekStatsForMonth(
  year: number,
  month: number,
  byDay: Record<string, DayStats>,
): { week: number; pnl: number; days: number; greenDays: number }[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks: { week: number; pnl: number; days: number; greenDays: number }[] = []
  let week = 1
  let bucket = { week: 1, pnl: 0, days: 0, greenDays: 0 }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dow = new Date(year, month, day).getDay()
    const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const row = byDay[dayKey]
    if (row) {
      bucket.pnl += row.pnl
      bucket.days += 1
      if (row.pnl > 0.001) bucket.greenDays += 1
    }
    const isSunday = dow === 0
    const isLast = day === daysInMonth
    if (isSunday || isLast) {
      if (bucket.days > 0) weeks.push({ ...bucket })
      week += 1
      bucket = { week, pnl: 0, days: 0, greenDays: 0 }
    }
  }
  return weeks
}

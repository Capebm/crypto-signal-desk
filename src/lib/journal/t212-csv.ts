import { getTradingSessionStatus } from '../trading-session'
import { t212ExecutionId, type T212Execution } from './t212-statement'
import { classifyAssetClass } from './asset-class'
import type { ClosedTrade, TradeExitType } from './types'

export type T212ClosedPosition = {
  positionId: string
  symbol: string
  /** Direção da abertura (Buy = long). */
  direction: 'Buy' | 'Sell'
  units: number
  openedAt: number
  closedAt: number
  avgPrice: number
  closePrice: number
  totalResult: number
  spread?: number
  overnight?: number
  /** Ordem que fechou a posição (STOP LOSS / TAKE PROFIT / MARKET…). */
  exitType?: TradeExitType
  /** SL/TP anexados na abertura (mesmo que cancelados). */
  plannedStop?: number
  plannedTarget?: number
}

export type T212CsvParseResult = {
  executions: T212Execution[]
  closedPositions: T212ClosedPosition[]
  closedTrades: ClosedTrade[]
  openExecutions: T212Execution[]
}

/**
 * CSV History T212 (History → Export CSV).
 * Closed position → PnL; Order EXECUTED OPEN/CLOSE → ledger / abertas.
 */
export function parseT212Csv(text: string): T212CsvParseResult {
  const rows = parseCsvRows(text)
  if (rows.length < 2) {
    return { executions: [], closedPositions: [], closedTrades: [], openExecutions: [] }
  }
  const header = rows[0].map((h) => h.trim())
  const col = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>
  const get = (row: string[], name: string) => {
    const i = col[name]
    return i === undefined ? '' : (row[i] ?? '').trim()
  }

  const executions: T212Execution[] = []
  const closedPositions: T212ClosedPosition[] = []
  const orderPlans = new Map<string, { stop?: number; target?: number; exitType?: TradeExitType }>()

  for (const row of rows.slice(1)) {
    if (row.length < 2) continue
    const recordType = get(row, 'Record Type')

    if (recordType === 'Order') {
      const status = get(row, 'Status').toUpperCase()
      const intent = get(row, 'Intent').toUpperCase()
      const orderType = get(row, 'Order type').toUpperCase()
      const orderPositionId = get(row, 'Position ID')
      if (orderPositionId) {
        const plan = orderPlans.get(orderPositionId) ?? {}
        const target = Number(get(row, 'Target price (instrument currency)'))
        if (orderType === 'STOP LOSS' && Number.isFinite(target) && target > 0) plan.stop = target
        if (orderType === 'TAKE PROFIT' && Number.isFinite(target) && target > 0) plan.target = target
        if (status === 'EXECUTED' && intent === 'CLOSE') plan.exitType = exitTypeFromOrder(orderType)
        orderPlans.set(orderPositionId, plan)
      }
      if (status !== 'EXECUTED') continue
      if (intent !== 'OPEN' && intent !== 'CLOSE') continue
      const symbol = get(row, 'Symbol').toUpperCase()
      const orderId = get(row, 'Order ID')
      const units = Number(get(row, 'Units'))
      const price =
        Number(get(row, 'Executed price (instrument currency)')) ||
        Number(get(row, 'Target price (instrument currency)'))
      const time = parseUtc(get(row, 'Date (UTC)') || get(row, 'Date created (UTC)'))
      if (!symbol || !orderId || !Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price <= 0 || !time) {
        continue
      }
      const direction = get(row, 'Direction') === 'Sell' ? 'Sell' : 'Buy'
      const base = {
        time,
        instrument: symbol,
        orderId,
        direction: direction as 'Buy' | 'Sell',
        size: units,
        price,
        source: 'cfd' as const,
        positionId: get(row, 'Position ID') || undefined,
      }
      executions.push({ ...base, id: t212ExecutionId(base) })
      continue
    }

    if (recordType === 'Closed position') {
      const positionId = get(row, 'Position ID')
      const symbol = get(row, 'Symbol').toUpperCase()
      const units = Number(get(row, 'Units'))
      const avgPrice = Number(get(row, 'Average price (instrument currency)'))
      const closePrice = Number(get(row, 'Close price (instrument currency)'))
      const openedAt = parseUtc(get(row, 'Date opened (UTC)'))
      const closedAt = parseUtc(get(row, 'Date closed (UTC)') || get(row, 'Date (UTC)'))
      const totalResult = Number(get(row, 'Total result (account currency)'))
      if (!positionId || !symbol || !openedAt || !closedAt) continue
      if (!Number.isFinite(units) || units <= 0) continue
      if (!Number.isFinite(avgPrice) || !Number.isFinite(closePrice)) continue
      closedPositions.push({
        positionId,
        symbol,
        direction: get(row, 'Direction') === 'Sell' ? 'Sell' : 'Buy',
        units,
        openedAt,
        closedAt,
        avgPrice,
        closePrice,
        totalResult: Number.isFinite(totalResult) ? totalResult : 0,
        spread: numOrUndef(get(row, 'Spread (account currency)')),
        overnight: numOrUndef(get(row, 'Overnight interest (account currency)')),
      })
    }
  }

  for (const position of closedPositions) {
    const plan = orderPlans.get(position.positionId)
    position.plannedStop = plan?.stop
    position.plannedTarget = plan?.target
    position.exitType = plan?.exitType ?? 'manual'
  }

  return rebuildT212FromCsv(closedPositions, executions)
}

function exitTypeFromOrder(orderType: string): TradeExitType {
  if (orderType === 'STOP LOSS') return 'sl'
  if (orderType === 'TAKE PROFIT') return 'tp'
  if (orderType === 'TRAILING STOP') return 'trailing'
  return 'manual'
}

/** Merge de vários CSVs: closed por Position ID + opens restantes. */
export function rebuildT212FromCsv(
  closedPositions: T212ClosedPosition[],
  executions: T212Execution[],
): {
  closedTrades: ClosedTrade[]
  openExecutions: T212Execution[]
  executions: T212Execution[]
  closedPositions: T212ClosedPosition[]
} {
  const posMap = new Map<string, T212ClosedPosition>()
  for (const p of closedPositions) posMap.set(p.positionId, p)
  const mergedClosed = [...posMap.values()].sort((a, b) => a.closedAt - b.closedAt)
  const closedIds = new Set(mergedClosed.map((p) => p.positionId))
  const execs = dedupeById(executions).sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))

  const openByPos = new Map<string, T212Execution>()
  for (const e of execs) {
    if (!e.positionId || closedIds.has(e.positionId)) continue
    // Manter a perna de abertura (mais cedo) por Position ID
    const prev = openByPos.get(e.positionId)
    if (!prev || e.time < prev.time) openByPos.set(e.positionId, e)
  }

  return {
    closedPositions: mergedClosed,
    closedTrades: mergedClosed.map(closedPositionToTrade),
    openExecutions: [...openByPos.values()],
    executions: execs,
  }
}

export function closedPositionToTrade(p: T212ClosedPosition): ClosedTrade {
  const entrySession = getTradingSessionStatus(new Date(p.openedAt), { market: 'cfd' })
  const exitSession = getTradingSessionStatus(new Date(p.closedAt), { market: 'cfd' })
  const cost = Math.abs(p.avgPrice * p.units)
  // A coluna Spread do CSV não é custo extra: já está nos preços (Result = units × Δpreço).
  const overnight = p.overnight ?? 0
  const fees = Math.abs(overnight)
  const side = p.direction === 'Sell' ? 'short' : 'long'
  return {
    id: `t212-pos-${p.positionId}`,
    symbol: p.symbol,
    base: p.symbol,
    entryTime: p.openedAt,
    exitTime: p.closedAt,
    entryPrice: p.avgPrice,
    exitPrice: p.closePrice,
    quantity: p.units,
    pnlUsdc: p.totalResult,
    pnlPct: cost > 0 ? (p.totalResult / cost) * 100 : 0,
    feesUsdc: fees,
    entrySession: entrySession.window,
    entrySessionBadge: entrySession.badge,
    exitSession: exitSession.window,
    exitSessionBadge: exitSession.badge,
    durationMs: p.closedAt - p.openedAt,
    venue: 't212',
    side,
    assetClass: classifyAssetClass(p.symbol, 't212'),
    exitType: p.exitType,
    plannedStop: p.plannedStop,
    plannedTarget: p.plannedTarget,
    overnight,
    realizedR: realizedR(side, p.avgPrice, p.closePrice, p.plannedStop),
  }
}

/** R realizado face ao stop planeado (sem stop válido → undefined). */
export function realizedR(side: 'long' | 'short', entry: number, exit: number, stop?: number): number | undefined {
  if (stop === undefined || !Number.isFinite(stop)) return undefined
  const risk = side === 'long' ? entry - stop : stop - entry
  if (!(risk > 0)) return undefined
  return (side === 'long' ? exit - entry : entry - exit) / risk
}

function parseUtc(raw: string): number | undefined {
  if (!raw) return undefined
  const t = Date.parse(raw.replace(' ', 'T'))
  return Number.isFinite(t) ? t : undefined
}

function numOrUndef(raw: string): number | undefined {
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function dedupeById(executions: T212Execution[]): T212Execution[] {
  const map = new Map<string, T212Execution>()
  for (const e of executions) map.set(e.id, e)
  return [...map.values()]
}

/** CSV mínimo com aspas. */
export function parseCsvRows(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"'
          i += 1
        } else inQuotes = false
      } else cell += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      cell = ''
      if (row.some((c) => c.length > 0)) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.length > 0)) rows.push(row)
  return rows
}

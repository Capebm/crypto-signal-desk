import type { TradeSignalMeta } from '../trade-signal-meta'
import { buildClosedTrades } from './round-trips'
import { dedupeExecutions, rebuildT212History, type T212Execution } from './t212-statement'
import type { ClosedTrade, JournalBackup, JournalStore, TradeVenue } from './types'
import type { BinanceFill } from './types'

const STORAGE_KEY = 'tjr-journal-v1'
const BACKUP_VERSION = 1 as const

const emptyStore = (): JournalStore => ({
  fills: [],
  dayNotes: {},
  signalByTradeId: {},
  venueByTradeId: {},
  externalTrades: [],
  t212Executions: [],
  t212OpenExecutions: [],
})

export function loadJournalStore(): JournalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as JournalStore
    return {
      fills: parsed.fills ?? [],
      dayNotes: parsed.dayNotes ?? {},
      signalByTradeId: parsed.signalByTradeId ?? {},
      venueByTradeId: parsed.venueByTradeId ?? {},
      externalTrades: parsed.externalTrades ?? [],
      t212Executions: parsed.t212Executions ?? [],
      t212OpenExecutions: parsed.t212OpenExecutions ?? [],
      lastImportAt: parsed.lastImportAt,
      lastImportRows: parsed.lastImportRows,
      lastT212ImportAt: parsed.lastT212ImportAt,
    }
  } catch {
    return emptyStore()
  }
}

export function saveJournalStore(store: JournalStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function importFills(incoming: BinanceFill[]): { store: JournalStore; trades: ClosedTrade[]; added: number } {
  const current = loadJournalStore()
  const before = new Set(current.fills.map((fill) => fill.id))
  const merged = [...current.fills]
  let added = 0

  for (const fill of incoming) {
    if (before.has(fill.id)) continue
    merged.push(fill)
    before.add(fill.id)
    added += 1
  }

  merged.sort((a, b) => a.time - b.time)
  const store: JournalStore = {
    ...current,
    fills: merged,
    signalByTradeId: current.signalByTradeId ?? {},
    venueByTradeId: current.venueByTradeId ?? {},
    externalTrades: current.externalTrades ?? [],
    lastImportAt: new Date().toISOString(),
    lastImportRows: incoming.length,
  }
  saveJournalStore(store)
  return { store, trades: getClosedTradesFromStore(store), added }
}

export function clearJournal() {
  localStorage.removeItem(STORAGE_KEY)
}

export function setDayNote(dayKey: string, note: string) {
  const store = loadJournalStore()
  store.dayNotes[dayKey] = note
  saveJournalStore(store)
  return store
}

function getClosedTradesFromStore(store: JournalStore): ClosedTrade[] {
  const fromFills = buildClosedTrades(store.fills).map((trade) => ({
    ...trade,
    venue: store.venueByTradeId?.[trade.id] ?? trade.venue ?? 'spot',
    signal: store.signalByTradeId?.[trade.id],
  }))
  const external = (store.externalTrades ?? []).map((trade) => ({
    ...trade,
    venue: trade.venue ?? 't212',
    signal: store.signalByTradeId?.[trade.id] ?? trade.signal,
  }))
  return [...fromFills, ...external].sort((a, b) => b.exitTime - a.exitTime)
}

export function getClosedTrades(): ClosedTrade[] {
  return getClosedTradesFromStore(loadJournalStore())
}

/** Download JSON — sobrevive a limpar cache / mudar de browser. */
export function exportJournalBackup(): JournalBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    store: loadJournalStore(),
  }
}

export function downloadJournalBackup() {
  const backup = exportJournalBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const day = backup.exportedAt.slice(0, 10)
  a.href = url
  a.download = `tjr-diario-${day}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export type ImportBackupMode = 'replace' | 'merge'

/** Importa backup JSON. `replace` apaga o local; `merge` une fills/notas/meta. */
export function importJournalBackup(
  raw: string,
  mode: ImportBackupMode = 'replace',
): { store: JournalStore; trades: ClosedTrade[]; ok: true } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'JSON inválido.' }
  }

  const backup = normalizeBackup(parsed)
  if (!backup) {
    return { ok: false, error: 'Ficheiro não é um backup do Diário TJR (falta store / fills).' }
  }

  let store: JournalStore
  if (mode === 'replace') {
    store = {
      fills: backup.store.fills ?? [],
      dayNotes: backup.store.dayNotes ?? {},
      signalByTradeId: backup.store.signalByTradeId ?? {},
      venueByTradeId: backup.store.venueByTradeId ?? {},
      externalTrades: backup.store.externalTrades ?? [],
      t212Executions: backup.store.t212Executions ?? [],
      t212OpenExecutions: backup.store.t212OpenExecutions ?? [],
      lastImportAt: new Date().toISOString(),
      lastImportRows: backup.store.fills?.length ?? 0,
      lastT212ImportAt: backup.store.lastT212ImportAt,
    }
  } else {
    const current = loadJournalStore()
    const fillIds = new Set(current.fills.map((f) => f.id))
    const fills = [...current.fills]
    for (const fill of backup.store.fills ?? []) {
      if (fillIds.has(fill.id)) continue
      fills.push(fill)
      fillIds.add(fill.id)
    }
    fills.sort((a, b) => a.time - b.time)
    const t212Executions = dedupeExecutions([
      ...(current.t212Executions ?? []),
      ...(backup.store.t212Executions ?? []),
    ])
    const rebuilt = rebuildT212History(t212Executions)
    const seenExt = new Set<string>()
    const nonT212External: ClosedTrade[] = []
    for (const trade of [...(current.externalTrades ?? []), ...(backup.store.externalTrades ?? [])]) {
      if (trade.venue === 't212' || seenExt.has(trade.id)) continue
      seenExt.add(trade.id)
      nonT212External.push(trade)
    }
    store = {
      fills,
      dayNotes: { ...current.dayNotes, ...(backup.store.dayNotes ?? {}) },
      signalByTradeId: { ...(current.signalByTradeId ?? {}), ...(backup.store.signalByTradeId ?? {}) },
      venueByTradeId: { ...(current.venueByTradeId ?? {}), ...(backup.store.venueByTradeId ?? {}) },
      t212Executions: rebuilt.executions,
      t212OpenExecutions: rebuilt.openExecutions,
      externalTrades: [...nonT212External, ...rebuilt.closedTrades],
      lastImportAt: new Date().toISOString(),
      lastImportRows: backup.store.fills?.length ?? 0,
      lastT212ImportAt: backup.store.lastT212ImportAt ?? current.lastT212ImportAt,
    }
  }

  saveJournalStore(store)
  return { ok: true, store, trades: getClosedTradesFromStore(store) }
}

function normalizeBackup(parsed: unknown): JournalBackup | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  // Formato versionado
  if (obj.store && typeof obj.store === 'object') {
    const store = obj.store as JournalStore
    if (!Array.isArray(store.fills)) return null
    return {
      version: 1,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      store,
    }
  }
  // Store cru (compat)
  if (Array.isArray(obj.fills)) {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      store: obj as unknown as JournalStore,
    }
  }
  return null
}

export type ManualClosedTradeInput = {
  symbol: string
  entryPrice: number
  exitPrice: number
  quantity: number
  entryTime: number
  exitTime: number
  feesUsdc?: number
  signal?: TradeSignalMeta
  venue?: TradeVenue
}

/** Regista um round-trip Spot long (BUY + SELL) sem CSV — não altera o motor TJR. */
export function addManualClosedTrade(input: ManualClosedTradeInput): { store: JournalStore; trades: ClosedTrade[]; trade?: ClosedTrade } {
  const symbol = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!symbol || input.quantity <= 0 || input.entryPrice <= 0 || input.exitPrice <= 0) {
    const store = loadJournalStore()
    return { store, trades: getClosedTrades() }
  }
  const entryTime = Math.min(input.entryTime, input.exitTime)
  const exitTime = Math.max(input.entryTime, input.exitTime)
  const fee = input.feesUsdc && input.feesUsdc > 0 ? input.feesUsdc / 2 : undefined
  const stamp = Date.now()
  const buy: BinanceFill = {
    id: `manual-buy-${symbol}-${entryTime}-${stamp}`,
    time: entryTime,
    symbol,
    side: 'BUY',
    price: input.entryPrice,
    quantity: input.quantity,
    quoteAmount: input.entryPrice * input.quantity,
    fee,
    feeAsset: fee !== undefined ? 'USDC' : undefined,
  }
  const sell: BinanceFill = {
    id: `manual-sell-${symbol}-${exitTime}-${stamp}`,
    time: exitTime,
    symbol,
    side: 'SELL',
    price: input.exitPrice,
    quantity: input.quantity,
    quoteAmount: input.exitPrice * input.quantity,
    fee,
    feeAsset: fee !== undefined ? 'USDC' : undefined,
  }
  const result = importFills([buy, sell])
  let store = result.store
  const trade = result.trades.find((t) => t.symbol === symbol && t.entryTime === entryTime && t.exitTime === exitTime)
  if (trade && (input.signal || input.venue)) {
    store = {
      ...store,
      signalByTradeId: input.signal
        ? { ...(store.signalByTradeId ?? {}), [trade.id]: input.signal }
        : store.signalByTradeId,
      venueByTradeId: input.venue
        ? { ...(store.venueByTradeId ?? {}), [trade.id]: input.venue }
        : store.venueByTradeId,
    }
    saveJournalStore(store)
  }
  const trades = getClosedTrades()
  const withMeta = trades.find((t) => t.id === trade?.id)
  return { store, trades, trade: withMeta ?? trade }
}

/** Importa Activity Statement T212: faz merge do ledger de execuções e reconstrói o histórico fechado. */
export function importT212Statement(incoming: T212Execution[]): {
  store: JournalStore
  trades: ClosedTrade[]
  addedExecutions: number
  closedCount: number
  openCount: number
  newlyClosed: number
} {
  const current = loadJournalStore()
  const beforeIds = new Set((current.t212Executions ?? []).map((e) => e.id))
  const beforeClosed = new Set(
    (current.externalTrades ?? []).filter((t) => t.venue === 't212').map((t) => t.id),
  )
  const mergedExecs = dedupeExecutions([...(current.t212Executions ?? []), ...incoming])
  const addedExecutions = mergedExecs.filter((e) => !beforeIds.has(e.id)).length
  const rebuilt = rebuildT212History(mergedExecs)
  const newlyClosed = rebuilt.closedTrades.filter((t) => !beforeClosed.has(t.id)).length
  const nonT212 = (current.externalTrades ?? []).filter((t) => t.venue !== 't212')
  const store: JournalStore = {
    ...current,
    t212Executions: rebuilt.executions,
    t212OpenExecutions: rebuilt.openExecutions,
    externalTrades: [...nonT212, ...rebuilt.closedTrades],
    lastImportAt: new Date().toISOString(),
    lastImportRows: incoming.length,
    lastT212ImportAt: new Date().toISOString(),
  }
  saveJournalStore(store)
  return {
    store,
    trades: getClosedTradesFromStore(store),
    addedExecutions,
    closedCount: rebuilt.closedTrades.length,
    openCount: rebuilt.openExecutions.length,
    newlyClosed,
  }
}

/** @deprecated Prefer importT212Statement — mantido para compat. */
export function importT212ClosedTrades(incoming: ClosedTrade[]): {
  store: JournalStore
  trades: ClosedTrade[]
  added: number
} {
  const current = loadJournalStore()
  const before = new Set((current.externalTrades ?? []).map((t) => t.id))
  const nonT212 = (current.externalTrades ?? []).filter((t) => t.venue !== 't212')
  const t212Prev = (current.externalTrades ?? []).filter((t) => t.venue === 't212')
  const merged = [...t212Prev]
  let added = 0
  for (const trade of incoming) {
    if (before.has(trade.id)) continue
    merged.push({ ...trade, venue: 't212' })
    before.add(trade.id)
    added += 1
  }
  const store: JournalStore = {
    ...current,
    externalTrades: [...nonT212, ...merged],
    lastImportAt: new Date().toISOString(),
    lastImportRows: incoming.length,
  }
  saveJournalStore(store)
  return { store, trades: getClosedTradesFromStore(store), added }
}

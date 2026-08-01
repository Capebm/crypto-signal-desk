import type { TradeSignalMeta } from '../trade-signal-meta'
import { buildClosedTrades } from './round-trips'
import type { BinanceFill, ClosedTrade, JournalStore } from './types'

const STORAGE_KEY = 'tjr-journal-v1'

const emptyStore = (): JournalStore => ({
  fills: [],
  dayNotes: {},
  signalByTradeId: {},
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
      lastImportAt: parsed.lastImportAt,
      lastImportRows: parsed.lastImportRows,
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
    lastImportAt: new Date().toISOString(),
    lastImportRows: incoming.length,
  }
  saveJournalStore(store)
  return { store, trades: buildClosedTrades(merged), added }
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

export function getClosedTrades(): ClosedTrade[] {
  const store = loadJournalStore()
  return buildClosedTrades(store.fills).map((trade) => ({
    ...trade,
    signal: store.signalByTradeId?.[trade.id],
  }))
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
  if (trade && input.signal) {
    store = {
      ...store,
      signalByTradeId: { ...(store.signalByTradeId ?? {}), [trade.id]: input.signal },
    }
    saveJournalStore(store)
  }
  const trades = getClosedTrades()
  const withSignal = trades.find((t) => t.id === trade?.id)
  return { store, trades, trade: withSignal ?? trade }
}

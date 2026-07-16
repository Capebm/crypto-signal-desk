import { buildClosedTrades } from './round-trips'
import type { BinanceFill, ClosedTrade, JournalStore } from './types'

const STORAGE_KEY = 'tjr-journal-v1'

const emptyStore = (): JournalStore => ({
  fills: [],
  dayNotes: {},
})

export function loadJournalStore(): JournalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as JournalStore
    return {
      fills: parsed.fills ?? [],
      dayNotes: parsed.dayNotes ?? {},
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
  return buildClosedTrades(loadJournalStore().fills)
}

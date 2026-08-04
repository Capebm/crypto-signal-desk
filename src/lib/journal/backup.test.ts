import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJournalBackup, importJournalBackup, loadJournalStore, saveJournalStore } from './trade-store'
import type { JournalStore } from './types'

const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v)
    },
    removeItem: (k: string) => {
      memory.delete(k)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('journal backup', () => {
  it('round-trips export → import replace', () => {
    const store: JournalStore = {
      fills: [
        {
          id: 'a',
          time: 1,
          symbol: 'BTCUSDC',
          side: 'BUY',
          price: 100,
          quantity: 1,
          quoteAmount: 100,
        },
        {
          id: 'b',
          time: 2,
          symbol: 'BTCUSDC',
          side: 'SELL',
          price: 110,
          quantity: 1,
          quoteAmount: 110,
        },
      ],
      dayNotes: { '2026-07-14': 'nota' },
      signalByTradeId: {},
      venueByTradeId: {},
    }
    saveJournalStore(store)
    const backup = exportJournalBackup()
    expect(backup.version).toBe(1)
    expect(backup.store.fills).toHaveLength(2)

    memory.clear()
    const result = importJournalBackup(JSON.stringify(backup), 'replace')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.store.dayNotes['2026-07-14']).toBe('nota')
    expect(result.trades).toHaveLength(1)
    expect(loadJournalStore().fills).toHaveLength(2)
  })
})

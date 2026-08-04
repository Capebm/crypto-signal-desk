import { describe, expect, it } from 'vitest'
import {
  T212_CORE_IDS,
  T212_EXTRA_INSTRUMENTS,
  resolveT212Watchlist,
  t212RequireSmtAlign,
} from './yahoo-market'

describe('t212 watchlist + smt policy', () => {
  it('always keeps core instruments when resolving watchlist', () => {
    const list = resolveT212Watchlist(['audusd', 'eu50', 'missing'])
    const ids = list.map((item) => item.id)
    for (const id of T212_CORE_IDS) expect(ids).toContain(id)
    expect(ids).toContain('audusd')
    expect(ids).toContain('eu50')
    expect(ids).not.toContain('missing')
  })

  it('exposes extras for optional watchlist', () => {
    expect(T212_EXTRA_INSTRUMENTS.length).toBeGreaterThanOrEqual(4)
    expect(T212_EXTRA_INSTRUMENTS.every((item) => !T212_CORE_IDS.includes(item.id))).toBe(true)
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.kind === 'stock')).toBe(true)
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.id === 'nvda')).toBe(true)
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.id === 'dxy')).toBe(true)
  })

  it('requires SMT for indices and futures when profile asks', () => {
    const index = resolveT212Watchlist([])[0]
    expect(index.kind).toBe('index')
    expect(t212RequireSmtAlign(index, true)).toBe(true)
    expect(t212RequireSmtAlign(index, false)).toBe(false)

    const future = T212_EXTRA_INSTRUMENTS.find((item) => item.kind === 'future')!
    expect(future.yahooSymbol).toMatch(/=F$/)
    expect(t212RequireSmtAlign(future, true)).toBe(true)

    const forex = T212_EXTRA_INSTRUMENTS.find((item) => item.kind === 'forex')!
    expect(t212RequireSmtAlign(forex, true)).toBe(false)

    const crypto = T212_EXTRA_INSTRUMENTS.find((item) => item.kind === 'crypto')!
    expect(crypto.yahooSymbol).toMatch(/-USD$/)
    expect(t212RequireSmtAlign(crypto, true)).toBe(false)
  })
})


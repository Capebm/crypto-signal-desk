import { describe, expect, it } from 'vitest'
import { computeEsNqAlignment, t212NeedsEsNqGate, trendsEsNqAligned } from './t212-es-nq'
import { usIndexPrimeWindow } from './trading-session'
import type { Candle } from './types'
import { T212_EXTRA_INSTRUMENTS, T212_INSTRUMENTS } from './yahoo-market'

describe('t212 ES↔NQ gate', () => {
  it('applies only to US index/future ids', () => {
    expect(t212NeedsEsNqGate(T212_INSTRUMENTS.find((i) => i.id === 'us500')!)).toBe(true)
    expect(t212NeedsEsNqGate(T212_EXTRA_INSTRUMENTS.find((i) => i.id === 'es')!)).toBe(true)
    expect(t212NeedsEsNqGate(T212_INSTRUMENTS.find((i) => i.id === 'eurusd')!)).toBe(false)
    expect(t212NeedsEsNqGate(T212_EXTRA_INSTRUMENTS.find((i) => i.id === 'btc')!)).toBe(false)
  })

  it('aligns only when both bullish or both bearish', () => {
    expect(trendsEsNqAligned('bullish', 'bullish')).toBe(true)
    expect(trendsEsNqAligned('bearish', 'bearish')).toBe(true)
    expect(trendsEsNqAligned('bullish', 'bearish')).toBe(false)
    expect(trendsEsNqAligned('bullish', 'neutral')).toBe(false)
    expect(trendsEsNqAligned('neutral', 'neutral')).toBe(false)
  })

  it('reports disagree note from candle packs', () => {
    const flat = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({
      openTime: 1_700_000_000_000 + i * 300_000,
      open: 100,
      high: 100.1,
      low: 99.9,
      close: 100,
      volume: 1,
    }))
    const mixed = computeEsNqAlignment(flat(30), flat(30))
    // flat → often neutral; gate must not claim aligned bull/bear pair
    if (mixed.esTrend !== mixed.nqTrend || mixed.esTrend === 'neutral') {
      expect(mixed.aligned).toBe(false)
    }
  })

  it('US prime window is 09:30–10:30 ET', () => {
    // 2026-08-03 13:00 UTC = 09:00 ET (EDT) → before open
    const before = usIndexPrimeWindow(new Date('2026-08-03T13:00:00.000Z'))
    expect(before.beforeOpen).toBe(true)
    // 14:00 UTC = 10:00 ET → in prime
    const prime = usIndexPrimeWindow(new Date('2026-08-03T14:00:00.000Z'))
    expect(prime.inPrime).toBe(true)
    // 15:00 UTC = 11:00 ET → after cutoff
    const after = usIndexPrimeWindow(new Date('2026-08-03T15:00:00.000Z'))
    expect(after.afterCutoff).toBe(true)
  })
})

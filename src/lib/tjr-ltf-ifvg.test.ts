import { describe, expect, it } from 'vitest'
import type { Candle } from './types'
import { ltfConfirmSignal, ltfEntryConfirmation } from './tjr-structure'

const c = (
  open: number,
  high: number,
  low: number,
  close: number,
  i: number,
): Candle => ({
  openTime: i * 60_000,
  open,
  high,
  low,
  close,
  volume: 1,
})

/** Downtrend then bullish BOS (retrace for short) then bearish BOS (entry short). */
function shortEntrySeries(): Candle[] {
  const out: Candle[] = []
  let i = 0
  // Build lower highs / lower lows
  out.push(c(100, 101, 99, 100.5, i++)) // up
  out.push(c(100.5, 101, 98, 98.5, i++)) // down → high
  out.push(c(98.5, 99, 97, 97.5, i++)) // down
  out.push(c(97.5, 98.5, 97, 98, i++)) // up → low
  out.push(c(98, 98.2, 96, 96.5, i++)) // down
  out.push(c(96.5, 97.5, 96.2, 97, i++)) // up → low
  out.push(c(97, 97.2, 95, 95.5, i++)) // down LH/LL
  out.push(c(95.5, 96.8, 95.2, 96.5, i++)) // up → low
  // Retrace: close above recent high → bullish BOS
  out.push(c(96.5, 99.5, 96.4, 99.2, i++))
  // Directional: close back under recent low → bearish BOS
  out.push(c(99.2, 99.3, 94.5, 94.8, i++))
  out.push(c(94.8, 95.2, 94.2, 94.5, i++))
  out.push(c(94.5, 94.8, 93.8, 94.0, i++))
  return out
}

describe('ltfEntryConfirmation', () => {
  it('ready after opposite BOS then aligned BOS', () => {
    const candles = shortEntrySeries()
    const result = ltfEntryConfirmation(candles, 'short', 45)
    expect(result.retraceSeen).toBe(true)
    expect(result.ready).toBe(true)
    expect(result.entryVia).toBe('bos')
    expect(result.entryPrice).toBeDefined()
  })

  it('not ready without directional confirm after retrace', () => {
    const candles = shortEntrySeries().slice(0, -3)
    const result = ltfEntryConfirmation(candles, 'short', 45)
    expect(result.ready).toBe(false)
  })

  it('does not arm a strict entry when the opposite signal misses the continuation zone', () => {
    const result = ltfEntryConfirmation(
      shortEntrySeries(),
      'short',
      45,
      { low: 110, high: 111, kind: 'fair-value-gap' },
    )
    expect(result.retraceSeen).toBe(false)
    expect(result.retraceInZone).toBe(false)
    expect(result.ready).toBe(false)
  })

  it('confirms after the opposite signal trades inside the continuation zone', () => {
    const result = ltfEntryConfirmation(
      shortEntrySeries(),
      'short',
      45,
      { low: 97, high: 100, kind: 'fair-value-gap' },
    )
    expect(result.retraceSeen).toBe(true)
    expect(result.retraceInZone).toBe(true)
    expect(result.ready).toBe(true)
  })

  it('Prático still requires the opposite signal inside the continuation zone', () => {
    const result = ltfEntryConfirmation(
      shortEntrySeries(),
      'short',
      45,
      { low: 110, high: 111, kind: 'fair-value-gap' },
      true,
    )
    expect(result.retraceSeen).toBe(false)
    expect(result.ready).toBe(false)
  })
})

describe('ltfConfirmSignal', () => {
  it('returns bos when structure breaks', () => {
    const candles = shortEntrySeries()
    const signal = ltfConfirmSignal(candles)
    expect(signal?.via).toBe('bos')
    expect(signal?.direction === 'bullish' || signal?.direction === 'bearish').toBe(true)
  })
})

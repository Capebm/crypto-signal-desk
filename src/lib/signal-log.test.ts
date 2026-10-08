import { describe, expect, it } from 'vitest'
import { buildSignalRecord, computeSignalStats, dropRepeatSignals, resolveSignalOutcome, signalKey, type StoredSignal } from './signal-log'
import type { Candle } from './types'

const t0 = Date.UTC(2026, 9, 1, 14, 0)
const candle = (minutes: number, high: number, low: number, close = (high + low) / 2): Candle => ({
  openTime: t0 + minutes * 60_000,
  open: close,
  high,
  low,
  close,
  volume: 1,
})

const longSignal = { side: 'long' as const, entry: 100, stop: 98, target: 103, signal_at: new Date(t0).toISOString() }

describe('buildSignalRecord', () => {
  it('rejects incoherent levels and buckets the key by 15 minutes', () => {
    const base = {
      venue: 'spot' as const,
      symbol: 'NOMUSDC',
      base: 'nom',
      instrumentKind: 'crypto' as const,
      side: 'long' as const,
      score: 72.4,
      warnings: [],
      at: new Date(t0),
    }
    expect(buildSignalRecord({ ...base, entry: 100, stop: 101, target: 103 })).toBeUndefined()
    const record = buildSignalRecord({ ...base, entry: 100, stop: 98, target: 103 })!
    expect(record.base).toBe('NOM')
    expect(record.rr).toBe(1.5)
    expect(record.score).toBe(72)
    expect(record.signal_key).toBe(signalKey('spot', 'NOM', 'long', t0 + 14 * 60_000))
  })
})

describe('resolveSignalOutcome', () => {
  it('ignores the candle that opened before the signal', () => {
    const outcome = resolveSignalOutcome(longSignal, [candle(-5, 104, 97), candle(0, 103.5, 99.5)])
    expect(outcome?.status).toBe('tp')
    expect(outcome?.r_multiple).toBe(1.5)
  })

  it('stop hit returns -1R and tracks MFE', () => {
    const outcome = resolveSignalOutcome(longSignal, [candle(0, 101, 99.5), candle(5, 100.5, 97.9)])
    expect(outcome).toMatchObject({ status: 'sl', r_multiple: -1, mfe_r: 0.5 })
  })

  it('both levels in one candle is ambiguous and conservative', () => {
    expect(resolveSignalOutcome(longSignal, [candle(0, 103.2, 97.5)])).toMatchObject({ status: 'ambiguous', r_multiple: -1 })
  })

  it('short side mirrors the levels', () => {
    const short = { side: 'short' as const, entry: 100, stop: 102, target: 97, signal_at: longSignal.signal_at }
    expect(resolveSignalOutcome(short, [candle(0, 100.5, 96.9)])?.status).toBe('tp')
  })

  it('stays open until expiry, then counts R at the last close', () => {
    expect(resolveSignalOutcome(longSignal, [candle(0, 101, 99.5)])).toBeUndefined()
    const candles = Array.from({ length: 48 * 12 }, (_, i) => candle(i * 5, 101, 99, 101))
    expect(resolveSignalOutcome(longSignal, candles)).toMatchObject({ status: 'expired', r_multiple: 0.5 })
  })

  it('expires at the last in-window close when the 48h end while the market is closed', () => {
    // Sexta à tarde, depois nada até segunda (já fora das 48h): antes ficava 'open' para sempre.
    const friday = [candle(0, 100.5, 99.5, 100.4), candle(5, 100.6, 99.8, 100.2)]
    const monday = [candle(70 * 60, 99, 97, 97.5)]
    expect(resolveSignalOutcome(longSignal, friday)).toBeUndefined()
    expect(resolveSignalOutcome(longSignal, [...friday, ...monday])).toMatchObject({ status: 'expired', exit_price: 100.2, r_multiple: 0.1 })
  })
})

describe('dropRepeatSignals', () => {
  const at = (minutes: number) => new Date(t0 + minutes * 60_000).toISOString()
  const s = (base: string, minutes: number, side: 'long' | 'short' = 'long') => ({ venue: 't212' as const, base, side, signal_at: at(minutes) })

  it('keeps one signal per setup inside 15 min, even across bucket boundaries', () => {
    // 14:13 e 14:26 caem em blocos de 15 min diferentes mas são o mesmo setup.
    const kept = dropRepeatSignals([s('MSFT', 13), s('MSFT', 26), s('GE', 26), s('MSFT', 26, 'short'), s('MSFT', 29)])
    expect(kept.map((x) => `${x.base}@${x.signal_at.slice(11, 16)}:${x.side}`)).toEqual([
      'MSFT@14:13:long',
      'GE@14:26:long',
      'MSFT@14:26:short',
      'MSFT@14:29:long',
    ])
  })
})

describe('computeSignalStats', () => {
  it('splits resolved R by warning and version', () => {
    let n = 0
    const make = (r: number | null, warnings: StoredSignal['warnings'], version = '3.1.0'): StoredSignal => ({
      id: crypto.randomUUID(),
      created_at: '',
      signal_key: crypto.randomUUID(),
      venue: 't212',
      symbol: 'META',
      base: 'META',
      instrument_kind: 'stock',
      side: 'long',
      entry: 1,
      stop: 0.9,
      target: 1.2,
      rr: 2,
      score: 70,
      warnings,
      app_version: version,
      // 30 min entre sinais: setups distintos, não repetições.
      signal_at: new Date(t0 + n++ * 30 * 60_000).toISOString(),
      status: r === null ? 'open' : r > 0 ? 'tp' : 'sl',
      r_multiple: r,
    })
    const stats = computeSignalStats([make(2, []), make(-1, ['acao_cfd']), make(-1, ['acao_cfd', 'fora_janela']), make(null, [])])
    expect(stats).toMatchObject({ total: 4, open: 1, resolved: 3, totalR: 0 })
    expect(stats.byWarning.sem_aviso).toEqual({ n: 1, wins: 1, sumR: 2 })
    expect(stats.byWarning.acao_cfd).toEqual({ n: 2, wins: 0, sumR: -2 })
    expect(stats.byVersion['3.1.0'].n).toBe(3)
  })

  it('leaves repeats of the same setup out of the numbers', () => {
    const make = (minutes: number, r: number): StoredSignal => ({
      id: crypto.randomUUID(),
      created_at: '',
      signal_key: crypto.randomUUID(),
      venue: 'spot',
      symbol: 'ORCAUSDC',
      base: 'ORCA',
      instrument_kind: 'crypto',
      side: 'long',
      entry: 1,
      stop: 0.9,
      target: 1.15,
      rr: 1.5,
      score: 70,
      warnings: [],
      app_version: '3.2.1',
      signal_at: new Date(t0 + minutes * 60_000).toISOString(),
      status: r > 0 ? 'tp' : 'sl',
      r_multiple: r,
    })
    const stats = computeSignalStats([make(0, -1), make(2, -1), make(45, 1.5)])
    expect(stats).toMatchObject({ total: 2, repeats: 1, resolved: 2, totalR: 0.5 })
  })
})

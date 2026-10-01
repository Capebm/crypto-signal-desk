import { describe, expect, it } from 'vitest'
import type { StoredSignal } from '../signal-log'
import { linkTradesToSignals } from './signal-link'
import type { ClosedTrade } from './types'

const t0 = Date.UTC(2026, 8, 24, 13, 40)

const signal = (over: Partial<StoredSignal>): StoredSignal => ({
  id: 'sig-1',
  created_at: '',
  signal_key: 'k',
  venue: 'spot',
  symbol: 'TRUMPUSDC',
  base: 'TRUMP',
  instrument_kind: 'crypto',
  side: 'long',
  entry: 1.99,
  stop: 1.93,
  target: 2.08,
  rr: 1.5,
  score: 70,
  warnings: [],
  app_version: '3.1.0',
  signal_at: new Date(t0).toISOString(),
  status: 'open',
  ...over,
})

const trade = (over: Partial<ClosedTrade>): ClosedTrade => ({
  id: 't1',
  symbol: 'TRUMPUSDC',
  base: 'TRUMP',
  entryTime: t0 + 8 * 60_000,
  exitTime: t0 + 3_600_000,
  entryPrice: 1.989,
  exitPrice: 2.01,
  quantity: 48.7,
  pnlUsdc: 0.9,
  pnlPct: 0.9,
  feesUsdc: 0.1,
  entrySession: 'ny_open',
  entrySessionBadge: '',
  exitSession: 'ny_open',
  exitSessionBadge: '',
  durationMs: 3_600_000,
  venue: 'spot',
  side: 'long',
  ...over,
})

describe('linkTradesToSignals', () => {
  it('links a Spot trade to the nearest prior signal and infers a manual exit', () => {
    const [linked] = linkTradesToSignals([trade({})], [signal({}), signal({ id: 'old', signal_at: new Date(t0 - 5 * 3_600_000).toISOString() })])
    expect(linked.signalId).toBe('sig-1')
    expect(linked.exitType).toBe('manual')
    expect(linked.realizedR).toBeCloseTo((2.01 - 1.989) / (1.989 - 1.93), 4)
    expect(linked.planFollowed).toBe(true)
  })

  it('does not link other sides or trades long after the signal', () => {
    expect(linkTradesToSignals([trade({ side: 'short' })], [signal({})])[0].signalId).toBeUndefined()
    expect(linkTradesToSignals([trade({ entryTime: t0 + 3 * 3_600_000 })], [signal({})])[0].signalId).toBeUndefined()
  })

  it('T212: plan followed only when the SL used matches the signal stop', () => {
    const t212 = trade({ venue: 't212', symbol: 'ETH', base: 'ETH', entryPrice: 2500, plannedStop: 2475 })
    const sig = signal({ venue: 't212', base: 'ETH', entry: 2500, stop: 2450 })
    expect(linkTradesToSignals([t212], [sig])[0].planFollowed).toBe(false)
    expect(linkTradesToSignals([{ ...t212, plannedStop: 2452 }], [sig])[0].planFollowed).toBe(true)
  })
})

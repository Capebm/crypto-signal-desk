import { describe, expect, it } from 'vitest'
import { exchangeFor } from './index-exchanges'
import { getTradingSessionStatus } from './trading-session'

// Quinta 8 out 2026: Frankfurt CEST (UTC+2), Tóquio UTC+9, NY EDT (UTC−4).
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 8, h, m))

describe('killzones per exchange', () => {
  it('GER40 follows Frankfurt: JÁ 09:00–10:30 local, AGUARDAR mid, no entries last hour', () => {
    const ger = { exchange: exchangeFor('GER40') }
    expect(getTradingSessionStatus(at(6, 30), ger)).toMatchObject({ window: 'london', allowEnterNow: false, blockEntries: false })
    expect(getTradingSessionStatus(at(7, 0), ger)).toMatchObject({ window: 'ny_open', allowEnterNow: true })
    expect(getTradingSessionStatus(at(8, 30), ger)).toMatchObject({ window: 'ny', allowEnterNow: false, blockEntries: false })
    expect(getTradingSessionStatus(at(14, 45), ger)).toMatchObject({ window: 'ny_close', blockEntries: true })
    expect(getTradingSessionStatus(at(16, 0), ger)).toMatchObject({ window: 'off', blockEntries: true })
  })

  it('JP225 opens at 09:00 Tokyo (00:00 UTC) while NY is closed', () => {
    expect(getTradingSessionStatus(at(0, 10), { exchange: exchangeFor('JP225') })).toMatchObject({ window: 'ny_open', allowEnterNow: true })
    expect(getTradingSessionStatus(at(0, 10))).toMatchObject({ allowEnterNow: false })
  })

  it('US indices keep the New York killzones', () => {
    expect(getTradingSessionStatus(at(13, 45), { exchange: exchangeFor('US500') })).toMatchObject({ window: 'ny_open', allowEnterNow: true })
    expect(getTradingSessionStatus(at(7, 0), { exchange: exchangeFor('US500') }).allowEnterNow).toBe(false)
  })
})

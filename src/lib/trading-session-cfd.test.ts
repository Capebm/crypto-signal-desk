import { describe, expect, it } from 'vitest'
import { getCfdMarketStatus, getTradingSessionStatus, sessionHardBlocksEntry } from './trading-session'

describe('CFD market calendar', () => {
  it('marks Saturday closed for CFD default', () => {
    // 2026-07-18 Saturday 15:00 UTC ≈ late morning ET
    const sat = new Date('2026-07-18T15:00:00.000Z')
    const cfd = getCfdMarketStatus(sat)
    expect(cfd.open).toBe(false)
    expect(getTradingSessionStatus(sat).blockEntries).toBe(true)
    expect(getTradingSessionStatus(sat).badge).toMatch(/fechado/i)
  })

  it('does not hard-block Saturday for crypto Spot', () => {
    const sat = new Date('2026-07-18T15:00:00.000Z')
    const crypto = getTradingSessionStatus(sat, { market: 'crypto' })
    expect(crypto.badge).not.toMatch(/fechado/i)
    // Still follows killzones — Saturday mid-day ET is typically quiet/off, not CFD weekend close
    expect(getCfdMarketStatus(sat).open).toBe(false)
  })

  it('marks Sunday morning closed before forex open', () => {
    const sunMorning = new Date('2026-07-19T12:00:00.000Z') // ~08:00 ET
    expect(getCfdMarketStatus(sunMorning).open).toBe(false)
  })

  it('treats off-killzone as quality only for Forex/Crypto policy', () => {
    const afterNyClose = new Date('2026-08-12T20:20:00.000Z') // 16:20 ET
    const status = getTradingSessionStatus(afterNyClose)
    expect(status.blockEntries).toBe(true)
    expect(sessionHardBlocksEntry(status)).toBe(true)
    expect(sessionHardBlocksEntry(status, true)).toBe(false)
  })
})

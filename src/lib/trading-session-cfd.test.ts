import { describe, expect, it } from 'vitest'
import { getCfdMarketStatus, getTradingSessionStatus } from './trading-session'

describe('CFD market calendar', () => {
  it('marks Saturday closed', () => {
    // 2026-07-18 Saturday 15:00 UTC ≈ late morning ET
    const sat = new Date('2026-07-18T15:00:00.000Z')
    const cfd = getCfdMarketStatus(sat)
    expect(cfd.open).toBe(false)
    expect(getTradingSessionStatus(sat).blockEntries).toBe(true)
    expect(getTradingSessionStatus(sat).badge).toMatch(/fechado/i)
  })

  it('marks Sunday morning closed before forex open', () => {
    const sunMorning = new Date('2026-07-19T12:00:00.000Z') // ~08:00 ET
    expect(getCfdMarketStatus(sunMorning).open).toBe(false)
  })
})

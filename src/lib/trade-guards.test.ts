import { describe, expect, it } from 'vitest'
import { hoursSinceIso, isPastTimeStop, TIME_STOP_HOURS } from './trade-guards'

describe('trade-guards time-stop', () => {
  it('detects age past time-stop threshold', () => {
    const now = Date.parse('2026-07-25T12:00:00.000Z')
    const nineHoursAgo = new Date(now - 9 * 3_600_000).toISOString()
    const twoHoursAgo = new Date(now - 2 * 3_600_000).toISOString()
    expect(hoursSinceIso(nineHoursAgo, now)).toBeCloseTo(9, 5)
    expect(isPastTimeStop(nineHoursAgo, TIME_STOP_HOURS, now)).toBe(true)
    expect(isPastTimeStop(twoHoursAgo, TIME_STOP_HOURS, now)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { computeLongStop } from './trade-levels'

describe('computeLongStop', () => {
  it('enforces minimum 3.5% stop when structure is too tight', () => {
    const entry = 0.00211
    const rawStop = 0.00209081
    const stop = computeLongStop(entry, rawStop)
    const pct = ((entry - stop) / entry) * 100
    expect(pct).toBeGreaterThanOrEqual(3.4)
    expect(stop).toBeLessThan(entry)
  })

  it('never places stop above entry', () => {
    const stop = computeLongStop(0.00211, 0.0025)
    expect(stop).toBeLessThan(0.00211)
  })

  it('caps maximum risk at 8%', () => {
    const entry = 1
    const rawStop = 0.5
    const stop = computeLongStop(entry, rawStop)
    expect((entry - stop) / entry).toBeLessThanOrEqual(0.081)
  })
})

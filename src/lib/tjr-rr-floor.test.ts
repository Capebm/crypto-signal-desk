import { describe, expect, it } from 'vitest'
import { riskProfiles } from './risk-profile'
import { requiredRiskReward } from './tjr-engine'
import { normalizeTpMode, tpModes } from './tp-mode'

describe('R:R floor', () => {
  it('never accepts less than ~1.5R, even for the legacy 1R mode', () => {
    expect(requiredRiskReward('1r', 1)).toBeCloseTo(1.485)
    expect(requiredRiskReward('liquidez', 1)).toBeCloseTo(1.485)
    expect(requiredRiskReward('liquidez', 2)).toBe(2)
  })

  it('every profile requires 1.5R and 1R is no longer offered', () => {
    for (const profile of Object.values(riskProfiles)) expect(profile.minimumRiskReward).toBeGreaterThanOrEqual(1.5)
    expect(tpModes).not.toContain('1r')
    expect(normalizeTpMode('1r')).toBe('1_5r')
    expect(normalizeTpMode('liquidez')).toBe('liquidez')
  })
})

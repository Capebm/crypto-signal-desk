import { describe, expect, it } from 'vitest'

/** Documenta política tjrVideoStrict vs softOpposed / LTF 5m. */
describe('tjrVideoStrict policy', () => {
  const softOpposed = (
    tjrVideoStrict: boolean,
    cfdPractical: boolean,
    wideNet: boolean,
    sweepOk: boolean,
    opposedSweep: boolean,
  ) => !tjrVideoStrict && (cfdPractical || wideNet) && sweepOk && opposedSweep

  const allowLtf5m = (tjrVideoStrict: boolean, usIndexPlaybook: boolean, cfdPractical: boolean) =>
    !tjrVideoStrict && !usIndexPlaybook && cfdPractical

  it('blocks softOpposed when video strict', () => {
    expect(softOpposed(true, true, true, true, true)).toBe(false)
    expect(softOpposed(false, true, false, true, true)).toBe(true)
  })

  it('blocks 5m LTF shortcut when video strict', () => {
    expect(allowLtf5m(true, false, true)).toBe(false)
    expect(allowLtf5m(false, false, true)).toBe(true)
    expect(allowLtf5m(false, true, true)).toBe(false)
  })

  it('lets Agent Prático use the same practical confirm as T212 crypto', () => {
    const agentPractical = (tjrVideoStrict: boolean, scanAllSetups: boolean) => !tjrVideoStrict && scanAllSetups
    expect(agentPractical(false, true)).toBe(true)
    expect(allowLtf5m(false, false, agentPractical(false, true))).toBe(true)
    expect(allowLtf5m(true, false, agentPractical(true, false))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

/**
 * Documenta a regra softOpposed (sem candles):
 * CFD prático / Malha larga + sweep alinhado + opposed → aviso, não veto.
 * Conservador estrito → opposed continua a bloquear.
 */
describe('softOpposed policy', () => {
  const softOpposed = (cfdPractical: boolean, wideNet: boolean, sweepOk: boolean, opposedSweep: boolean) =>
    (cfdPractical || wideNet) && sweepOk && opposedSweep

  const blockOpposed = (
    opposedSweep: boolean,
    riskyHighLong: boolean,
    soft: boolean,
  ) => opposedSweep && !riskyHighLong && !soft

  it('softens when aligned sweep exists under CFD or wide net', () => {
    expect(softOpposed(true, false, true, true)).toBe(true)
    expect(softOpposed(false, true, true, true)).toBe(true)
    expect(blockOpposed(true, false, true)).toBe(false)
  })

  it('does not soften conservador-style (no CFD/wide) or without aligned sweep', () => {
    expect(softOpposed(false, false, true, true)).toBe(false)
    expect(softOpposed(true, false, false, true)).toBe(false)
    expect(blockOpposed(true, false, false)).toBe(true)
  })
})

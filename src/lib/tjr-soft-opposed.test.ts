import { describe, expect, it } from 'vitest'
import { isStaleOpposedSweep, type DrawSweepHit } from './tjr-structure'

/**
 * Opposed só avisa (malha/CFD) quando é mais antigo que o sweep alinhado.
 * Opposed fresco continua a bloquear Conservador/Disciplina e também o Spot clássico.
 */
describe('softOpposed policy', () => {
  const hit = (openTime: number, direction: 'bullish' | 'bearish'): DrawSweepHit => ({
    direction,
    source: 'london',
    label: direction === 'bullish' ? 'Londres L' : 'Ásia H',
    price: 100,
    kind: direction === 'bullish' ? 'low' : 'high',
    candleIndex: openTime,
    openTime,
  })

  const softOpposed = (cfdPractical: boolean, wideNet: boolean, sweepOk: boolean, stale: boolean) =>
    (cfdPractical || wideNet) && sweepOk && stale

  const blockOpposed = (controllingOpposed: boolean, riskyHighLong: boolean, soft: boolean) =>
    controllingOpposed && !riskyHighLong && !soft

  it('softens only when the aligned sweep is fresher under CFD or wide net', () => {
    const aligned = hit(35, 'bullish')
    const opposed = hit(5, 'bearish')
    expect(isStaleOpposedSweep(aligned, opposed)).toBe(true)
    expect(softOpposed(true, false, true, true)).toBe(true)
    expect(softOpposed(false, true, true, true)).toBe(true)
    expect(blockOpposed(false, false, true)).toBe(false)
  })

  it('does not soften conservador-style or a fresher opposed sweep', () => {
    const aligned = hit(10, 'bullish')
    const opposed = hit(35, 'bearish')
    expect(isStaleOpposedSweep(aligned, opposed)).toBe(false)
    expect(softOpposed(false, false, true, true)).toBe(false)
    expect(softOpposed(true, false, false, true)).toBe(false)
    expect(blockOpposed(true, false, false)).toBe(true)
  })
})

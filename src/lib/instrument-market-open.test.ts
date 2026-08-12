import { describe, expect, it } from 'vitest'

/** Documenta: instrumentMarketOpen === false força downgrade AGORA → RETRACE. */
describe('instrumentMarketOpen policy', () => {
  const shouldDowngradeAgora = (
    entryTiming: 'AGORA' | 'RETRACE' | 'NENHUM',
    instrumentMarketOpen: boolean | undefined,
  ) => entryTiming === 'AGORA' && instrumentMarketOpen === false

  it('downgrades AGORA when market closed', () => {
    expect(shouldDowngradeAgora('AGORA', false)).toBe(true)
  })

  it('does not apply when undefined or open', () => {
    expect(shouldDowngradeAgora('AGORA', undefined)).toBe(false)
    expect(shouldDowngradeAgora('AGORA', true)).toBe(false)
    expect(shouldDowngradeAgora('RETRACE', false)).toBe(false)
  })
})

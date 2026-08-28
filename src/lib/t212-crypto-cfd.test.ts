import { describe, expect, it } from 'vitest'
import { t212ExecuteTicker, t212IsCfdListed, T212_CRYPTO_CFD_TICKER } from './t212-crypto-cfd'
import { instrumentById, resolveT212Watchlist, T212_EXTRA_INSTRUMENTS } from './yahoo-market'

describe('T212 crypto CFD listings', () => {
  it('does not treat INJ as a T212 crypto CFD', () => {
    const inj = instrumentById('inj')!
    expect(inj.short).toBe('INJ')
    expect(t212IsCfdListed(inj)).toBe(false)
    expect(resolveT212Watchlist(['inj']).some((item) => item.id === 'inj')).toBe(false)
  })

  it('maps Polygon to MATIC in the T212 app, not POL', () => {
    const pol = instrumentById('pol')!
    expect(t212IsCfdListed(pol)).toBe(true)
    expect(t212ExecuteTicker(pol)).toBe('MATIC')
    expect(T212_CRYPTO_CFD_TICKER.pol).toBe('MATIC')
  })

  it('keeps confirmed T212 crypto CFDs and drops ticker collisions', () => {
    expect(t212IsCfdListed(instrumentById('bch')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('uni')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('atom')!)).toBe(false)
    expect(t212IsCfdListed(instrumentById('jup')!)).toBe(false)
    expect(t212IsCfdListed(instrumentById('sui')!)).toBe(false)
    expect(T212_EXTRA_INSTRUMENTS.filter((item) => item.kind === 'crypto' && t212IsCfdListed(item)).length).toBeGreaterThanOrEqual(10)
  })
})

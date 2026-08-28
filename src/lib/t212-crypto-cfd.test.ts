import { describe, expect, it } from 'vitest'
import { t212ExecuteTicker, t212IsCfdListed, T212_CRYPTO_CFD_TICKER } from './t212-crypto-cfd'
import { instrumentById, resolveT212Watchlist, T212_EXTRA_INSTRUMENTS } from './yahoo-market'

describe('T212 crypto CFD listings', () => {
  it('keeps INJ, ATOM and JUP on the T212 scan (Binance feed, T212 name)', () => {
    const inj = instrumentById('inj')!
    expect(inj.short).toBe('INJ')
    expect(t212IsCfdListed(inj)).toBe(true)
    expect(resolveT212Watchlist(['inj']).some((item) => item.id === 'inj')).toBe(true)
    expect(t212IsCfdListed(instrumentById('atom')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('jup')!)).toBe(true)
    expect(instrumentById('atom')!.t212Search).toBe('Cosmos')
    expect(t212ExecuteTicker(instrumentById('atom')!)).toBe('Cosmos')
    expect(instrumentById('jup')!.t212Search).toBe('Jupiter')
    expect(t212ExecuteTicker(instrumentById('jup')!)).toBe('Jupiter')
  })

  it('maps Polygon to MATIC in the T212 app, not POL', () => {
    const pol = instrumentById('pol')!
    expect(t212ExecuteTicker(pol)).toBe('MATIC')
    expect(T212_CRYPTO_CFD_TICKER.pol).toBe('MATIC')
  })

  it('keeps the catalog cryptos as T212 short candidates', () => {
    expect(t212IsCfdListed(instrumentById('bch')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('sui')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('ton')!)).toBe(true)
    expect(T212_EXTRA_INSTRUMENTS.filter((item) => item.kind === 'crypto').length).toBeGreaterThanOrEqual(50)
  })
})

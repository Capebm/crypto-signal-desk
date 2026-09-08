import { describe, expect, it } from 'vitest'
import { t212ExecuteTicker, t212IsCfdListed, T212_APP_TICKER, T212_CRYPTO_CFD_TICKER } from './t212-crypto-cfd'
import { instrumentById, resolveT212Watchlist, T212_CATALOG, T212_EXTRA_INSTRUMENTS } from './yahoo-market'

describe('T212 app search tickers', () => {
  it('never invents composite search strings or fake index tickers', () => {
    for (const item of T212_CATALOG) {
      expect(item.t212Search, item.id).not.toMatch(/ \//)
      expect(t212ExecuteTicker(item), item.id).toBe(item.t212Search)
      expect(t212ExecuteTicker(item), item.id).not.toMatch(/ \//)
    }
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.id === 'swe30')).toBe(false)
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.id === 'dxy')).toBe(false)
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.id === 'aus200')).toBe(false)
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.id === 'us2000')).toBe(false)
    expect(T212_EXTRA_INSTRUMENTS.some((item) => item.id === 'rty')).toBe(false)
  })

  it('only lists crypto CFDs that exist on Trading 212 search', () => {
    expect(t212IsCfdListed(instrumentById('btc')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('bch')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('pol')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('inj')!)).toBe(false)
    expect(t212IsCfdListed(instrumentById('sui')!)).toBe(false)
    expect(t212IsCfdListed(instrumentById('jup')!)).toBe(false)
    expect(t212IsCfdListed(instrumentById('atom')!)).toBe(false)
    expect(resolveT212Watchlist(['inj', 'jup', 'btc']).map((item) => item.id)).toEqual(
      expect.arrayContaining(['btc']),
    )
    expect(resolveT212Watchlist(['inj', 'jup']).some((item) => item.id === 'inj' || item.id === 'jup')).toBe(false)
    expect(t212ExecuteTicker(instrumentById('pol')!)).toBe('MATIC')
    expect(T212_EXTRA_INSTRUMENTS.filter((item) => item.kind === 'crypto' && t212IsCfdListed(item)).length).toBe(
      Object.keys(T212_CRYPTO_CFD_TICKER).length,
    )
  })

  it('maps T212 app tickers the user can type in search', () => {
    expect(t212ExecuteTicker(instrumentById('pol')!)).toBe('MATIC')
    expect(T212_CRYPTO_CFD_TICKER.pol).toBe('MATIC')
    expect(t212ExecuteTicker(instrumentById('fra40')!)).toBe('FR40')
    expect(t212ExecuteTicker(instrumentById('neth25')!)).toBe('NL25')
    expect(t212ExecuteTicker(instrumentById('spa35')!)).toBe('SPAIN35')
    expect(t212ExecuteTicker(instrumentById('jp225')!)).toBe('JPN225')
    expect(t212ExecuteTicker(instrumentById('es')!)).toBe('US500')
    expect(t212ExecuteTicker(instrumentById('nq')!)).toBe('TECH100')
    expect(t212ExecuteTicker(instrumentById('oil')!)).toBe('CRUDE')
    expect(t212ExecuteTicker(instrumentById('xauusd')!)).toBe('XAUUSD')
    expect(t212ExecuteTicker(instrumentById('xagusd')!)).toBe('XAGUSD')
    expect(t212ExecuteTicker(instrumentById('platinum')!)).toBe('XPTUSD')
    expect(t212ExecuteTicker(instrumentById('palladium')!)).toBe('PALLADIUM')
    expect(T212_APP_TICKER.volx).toBe('VOLX')
  })
})

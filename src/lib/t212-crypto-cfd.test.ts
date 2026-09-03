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

  it('keeps catalog cryptos for Binance→T212 shorts', () => {
    expect(t212IsCfdListed(instrumentById('inj')!)).toBe(true)
    expect(resolveT212Watchlist(['inj']).some((item) => item.id === 'inj')).toBe(true)
    expect(t212IsCfdListed(instrumentById('sui')!)).toBe(true)
    expect(t212ExecuteTicker(instrumentById('atom')!)).toBe('Cosmos')
    expect(t212ExecuteTicker(instrumentById('jup')!)).toBe('Jupiter')
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

  it('keeps catalog cryptos as T212 short candidates', () => {
    expect(t212IsCfdListed(instrumentById('bch')!)).toBe(true)
    expect(t212IsCfdListed(instrumentById('btc')!)).toBe(true)
    expect(T212_EXTRA_INSTRUMENTS.filter((item) => item.kind === 'crypto' && t212IsCfdListed(item)).length).toBeGreaterThanOrEqual(50)
  })
})

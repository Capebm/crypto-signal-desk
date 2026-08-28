import { describe, expect, it } from 'vitest'
import { pickBinanceCryptoSymbol, t212CryptoBaseAliases } from './t212-binance-feed'

describe('t212 Binance crypto mapping', () => {
  const usdc = new Set(['BTCUSDC', 'ETHUSDC', 'POLUSDC', 'RENDERUSDC'])
  const usdt = new Set(['BTCUSDT', 'ETHUSDT', 'MATICUSDT', 'RNDRUSDT', 'FETUSDT', 'BONKUSDT'])

  it('prefers USDC over USDT', () => {
    expect(pickBinanceCryptoSymbol(['BTC'], usdc, usdt)).toBe('BTCUSDC')
  })

  it('falls back to USDT when there is no USDC pair', () => {
    expect(pickBinanceCryptoSymbol(['BONK'], usdc, usdt)).toBe('BONKUSDT')
  })

  it('maps POL/MATIC, RENDER/RNDR and FET aliases', () => {
    expect(t212CryptoBaseAliases('POL')).toEqual(['POL', 'MATIC'])
    expect(t212CryptoBaseAliases('RENDER')).toEqual(['RENDER', 'RNDR'])
    expect(t212CryptoBaseAliases('FET')).toEqual(['FET', 'ASI'])
    expect(pickBinanceCryptoSymbol(t212CryptoBaseAliases('POL'), usdc, usdt)).toBe('POLUSDC')
    expect(pickBinanceCryptoSymbol(t212CryptoBaseAliases('MATIC'), usdc, usdt)).toBe('POLUSDC')
    expect(pickBinanceCryptoSymbol(t212CryptoBaseAliases('RENDER'), new Set(), usdt)).toBe('RNDRUSDT')
    expect(pickBinanceCryptoSymbol(t212CryptoBaseAliases('FET'), usdc, usdt)).toBe('FETUSDT')
  })

  it('returns undefined when no alias is listed', () => {
    expect(pickBinanceCryptoSymbol(t212CryptoBaseAliases('FAKECOIN'), usdc, usdt)).toBeUndefined()
  })
})

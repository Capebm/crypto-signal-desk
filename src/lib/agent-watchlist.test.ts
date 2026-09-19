import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addAgentPin, AGENT_DEFAULT_PINS, agentPinSymbols, normalizeAgentBase, readAgentPins, removeAgentPin } from './agent-watchlist'
import { isTokenizedEquityBase, mergeMarketLists } from './binance'

const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v)
    },
    removeItem: (k: string) => {
      memory.delete(k)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('agent watchlist pins', () => {
  it('normalizes bases and strips USDC', () => {
    expect(normalizeAgentBase(' pyth/usdc ')).toBe('PYTH')
    expect(normalizeAgentBase('ACHUSDC')).toBe('ACH')
  })

  it('seeds default pins on first read', () => {
    expect(readAgentPins()).toEqual([...AGENT_DEFAULT_PINS])
    expect(agentPinSymbols('USDC')).toContain('PYTHUSDC')
  })

  it('adds and removes a pin', () => {
    addAgentPin('pepe')
    expect(readAgentPins()).toContain('PEPE')
    removeAgentPin('PEPE')
    expect(readAgentPins()).not.toContain('PEPE')
  })
})

describe('mergeMarketLists', () => {
  it('appends pinned symbols that are missing from the liquid list', () => {
    const liquid = [{ symbol: 'BTCUSDC', quoteVolume: 1, priceChangePercent: 0 }]
    const pinned = [
      { symbol: 'BTCUSDC', quoteVolume: 1, priceChangePercent: 0 },
      { symbol: 'PYTHUSDC', quoteVolume: 2, priceChangePercent: 1 },
    ]
    expect(mergeMarketLists(liquid, pinned).map((row) => row.symbol)).toEqual(['BTCUSDC', 'PYTHUSDC'])
  })
})

describe('isTokenizedEquityBase', () => {
  it('exclui acções tokenizadas da Binance (sufixo B)', () => {
    for (const base of ['AAPLB', 'NVDAB', 'TSLAB', 'SPYB', 'MSTRB', 'QQQB', 'GOOGLB']) {
      expect(isTokenizedEquityBase(base)).toBe(true)
    }
  })

  it('não apanha cryptos legítimas que acabam em B', () => {
    for (const base of ['BNB', 'ARB', 'SHIB', 'CKB', 'TRB', 'BB', 'YB', 'DGB', 'BEB']) {
      expect(isTokenizedEquityBase(base)).toBe(false)
    }
  })

  it('não apanha bases normais', () => {
    for (const base of ['BTC', 'ETH', 'SOL', 'PYTH', 'RENDER']) {
      expect(isTokenizedEquityBase(base)).toBe(false)
    }
  })
})

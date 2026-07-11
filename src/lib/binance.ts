import type { Candle, Interval, MarketTicker } from './types'

const BASE_URL = 'https://api.binance.com'

export async function getCandles(symbol: string, interval: Interval, limit = 200): Promise<Candle[]> {
  const response = await fetch(
    `${BASE_URL}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
  )

  if (!response.ok) {
    throw new Error('Não foi possível obter dados da Binance. Tenta novamente em instantes.')
  }

  const rows: [number, string, string, string, string, string][] = await response.json()
  return rows.map(([openTime, open, high, low, close, volume]) => ({
    openTime,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
  }))
}

export async function get24hChange(symbol: string): Promise<number> {
  const response = await fetch(`${BASE_URL}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`)
  if (!response.ok) return 0

  const ticker: { priceChangePercent: string } = await response.json()
  return Number(ticker.priceChangePercent)
}

const stableBases = new Set(['USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'USDS'])
const leveragedToken = /(UP|DOWN|BULL|BEAR)USDT$/

const eligibleSymbol = (symbol: string) => {
  const base = symbol.replace(/USDT$/, '')
  return symbol.endsWith('USDT') && !stableBases.has(base) && !leveragedToken.test(symbol)
}

export async function getLiquidUsdtMarkets(limit = 50): Promise<MarketTicker[]> {
  const [response, activeSymbols] = await Promise.all([
    fetch(`${BASE_URL}/api/v3/ticker/24hr`),
    getActiveUsdtSymbols(),
  ])
  if (!response.ok) throw new Error('Não foi possível obter a lista de mercados da Binance.')

  const active = new Set(activeSymbols)
  const rows: { symbol: string; quoteVolume: string; priceChangePercent: string }[] = await response.json()
  return rows
    .filter(({ symbol }) => active.has(symbol))
    .map(({ symbol, quoteVolume, priceChangePercent }) => ({
      symbol,
      quoteVolume: Number(quoteVolume),
      priceChangePercent: Number(priceChangePercent),
    }))
    .filter((ticker) => Number.isFinite(ticker.quoteVolume) && ticker.quoteVolume > 0)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, limit)
}

export async function getActiveUsdtSymbols(): Promise<string[]> {
  const response = await fetch(`${BASE_URL}/api/v3/exchangeInfo`)
  if (!response.ok) throw new Error('Não foi possível obter os pares ativos da Binance.')

  const payload: { symbols: { symbol: string; status: string; isSpotTradingAllowed: boolean }[] } = await response.json()
  return payload.symbols
    .filter(({ symbol, status, isSpotTradingAllowed }) => status === 'TRADING' && isSpotTradingAllowed && eligibleSymbol(symbol))
    .map(({ symbol }) => symbol)
    .sort()
}

export async function getPlaybookCandles(symbol: string): Promise<Record<'4h' | '1h' | '15m' | '5m', Candle[]>> {
  const [fourHour, oneHour, fifteenMinute, fiveMinute] = await Promise.all([
    getCandles(symbol, '4h'),
    getCandles(symbol, '1h'),
    getCandles(symbol, '15m'),
    getCandles(symbol, '5m'),
  ])

  return { '4h': fourHour, '1h': oneHour, '15m': fifteenMinute, '5m': fiveMinute }
}

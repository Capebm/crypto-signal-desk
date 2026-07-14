import type { Candle, Interval, MarketTicker } from './types'

const BASE_URL = 'https://api.binance.com'

/** Quote usado pelo agente TJR — USDC para utilizadores UE (MiCA). */
export const AGENT_QUOTE_ASSET = 'USDC' as const
export const BTC_REFERENCE_SYMBOL = `BTC${AGENT_QUOTE_ASSET}`

export type QuoteAsset = typeof AGENT_QUOTE_ASSET | 'USDT'

export function formatTradingPair(symbol: string, quote: QuoteAsset = AGENT_QUOTE_ASSET): string {
  if (symbol.endsWith(quote)) return `${symbol.slice(0, -quote.length)}/${quote}`
  return symbol
}

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

const stableBases = new Set(['USDC', 'USDT', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'USDS', 'EUR', 'EURI'])

const leveragedToken = (quote: QuoteAsset) => new RegExp(`(UP|DOWN|BULL|BEAR)${quote}$`)

const eligibleSymbol = (symbol: string, quote: QuoteAsset) => {
  const base = symbol.replace(new RegExp(`${quote}$`), '')
  return symbol.endsWith(quote) && !stableBases.has(base) && !leveragedToken(quote).test(symbol)
}

export async function getLiquidMarkets(limit = 50, quote: QuoteAsset = AGENT_QUOTE_ASSET): Promise<MarketTicker[]> {
  const [response, activeSymbols] = await Promise.all([
    fetch(`${BASE_URL}/api/v3/ticker/24hr`),
    getActiveQuoteSymbols(quote),
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

/** @deprecated Use getLiquidMarkets — mantido por compatibilidade interna. */
export const getLiquidUsdtMarkets = (limit = 50) => getLiquidMarkets(limit, AGENT_QUOTE_ASSET)

export async function getActiveQuoteSymbols(quote: QuoteAsset = AGENT_QUOTE_ASSET): Promise<string[]> {
  const response = await fetch(`${BASE_URL}/api/v3/exchangeInfo`)
  if (!response.ok) throw new Error('Não foi possível obter os pares ativos da Binance.')

  const payload: { symbols: { symbol: string; status: string; isSpotTradingAllowed: boolean }[] } = await response.json()
  return payload.symbols
    .filter(({ symbol, status, isSpotTradingAllowed }) => status === 'TRADING' && isSpotTradingAllowed && eligibleSymbol(symbol, quote))
    .map(({ symbol }) => symbol)
    .sort()
}

/** @deprecated Use getActiveQuoteSymbols */
export const getActiveUsdtSymbols = () => getActiveQuoteSymbols(AGENT_QUOTE_ASSET)

export async function getPlaybookCandles(symbol: string): Promise<Record<'4h' | '1h' | '15m' | '5m', Candle[]>> {
  const [fourHour, oneHour, fifteenMinute, fiveMinute] = await Promise.all([
    getCandles(symbol, '4h'),
    getCandles(symbol, '1h'),
    getCandles(symbol, '15m'),
    getCandles(symbol, '5m'),
  ])

  return { '4h': fourHour, '1h': oneHour, '15m': fifteenMinute, '5m': fiveMinute }
}

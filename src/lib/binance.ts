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

/** 24h ticker de pins Spot — inclui alts fora do top de volume. */
export async function getPinnedMarkets(symbols: string[]): Promise<MarketTicker[]> {
  const unique = [...new Set(symbols.filter((symbol) => /^[A-Z0-9]{5,20}$/.test(symbol)))]
  const rows = await Promise.all(unique.map(async (symbol) => {
    try {
      const response = await fetch(`${BASE_URL}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`)
      if (!response.ok) return undefined
      const ticker: { symbol: string; quoteVolume: string; priceChangePercent: string } = await response.json()
      const quoteVolume = Number(ticker.quoteVolume)
      const priceChangePercent = Number(ticker.priceChangePercent)
      if (!Number.isFinite(quoteVolume)) return undefined
      return { symbol: ticker.symbol, quoteVolume, priceChangePercent }
    } catch {
      return undefined
    }
  }))
  return rows.filter((row): row is MarketTicker => row !== undefined)
}

export function mergeMarketLists(liquid: MarketTicker[], pinned: MarketTicker[]): MarketTicker[] {
  const seen = new Set(liquid.map((row) => row.symbol))
  return [...liquid, ...pinned.filter((row) => !seen.has(row.symbol))]
}

/** @deprecated Use getLiquidMarkets — mantido por compatibilidade interna. */
export const getLiquidUsdtMarkets = (limit = 50) => getLiquidMarkets(limit, AGENT_QUOTE_ASSET)

const SPOT_SET_TTL_MS = 10 * 60_000
let spotSetCache: { at: number; usdc: Set<string>; usdt: Set<string> } | undefined

export async function getActiveSpotSymbolSets(): Promise<{ usdc: Set<string>; usdt: Set<string> }> {
  if (spotSetCache && Date.now() - spotSetCache.at < SPOT_SET_TTL_MS) {
    return { usdc: spotSetCache.usdc, usdt: spotSetCache.usdt }
  }
  const response = await fetch(`${BASE_URL}/api/v3/exchangeInfo`)
  if (!response.ok) throw new Error('Não foi possível obter os pares ativos da Binance.')
  const payload: { symbols: { symbol: string; status: string; isSpotTradingAllowed: boolean }[] } = await response.json()
  const usdc = new Set<string>()
  const usdt = new Set<string>()
  for (const row of payload.symbols) {
    if (row.status !== 'TRADING' || !row.isSpotTradingAllowed) continue
    if (eligibleSymbol(row.symbol, 'USDC')) usdc.add(row.symbol)
    if (eligibleSymbol(row.symbol, 'USDT')) usdt.add(row.symbol)
  }
  spotSetCache = { at: Date.now(), usdc, usdt }
  return { usdc, usdt }
}

export async function getActiveQuoteSymbols(quote: QuoteAsset = AGENT_QUOTE_ASSET): Promise<string[]> {
  const sets = await getActiveSpotSymbolSets()
  return [...(quote === 'USDT' ? sets.usdt : sets.usdc)].sort()
}

/** @deprecated Use getActiveQuoteSymbols */
export const getActiveUsdtSymbols = () => getActiveQuoteSymbols(AGENT_QUOTE_ASSET)

type PlaybookPack = Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>

/** Agrega 1h → 4h (mesma lógica Yahoo) — evita 1 pedido Binance extra por par. */
function aggregateTo4h(hourly: Candle[]): Candle[] {
  if (hourly.length === 0) return []
  const buckets = new Map<number, Candle[]>()
  for (const row of hourly) {
    const d = new Date(row.openTime)
    const bucket = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(d.getUTCHours() / 4) * 4)
    const list = buckets.get(bucket) ?? []
    list.push(row)
    buckets.set(bucket, list)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([openTime, rows]) => ({
      openTime,
      open: rows[0].open,
      high: Math.max(...rows.map((r) => r.high)),
      low: Math.min(...rows.map((r) => r.low)),
      close: rows[rows.length - 1].close,
      volume: rows.reduce((sum, r) => sum + r.volume, 0),
    }))
}

const playbookCache = new Map<string, { at: number; data: PlaybookPack }>()
/** Cache curto: acelera scan MTF; Refresh Aguardar / cartão usam bypass. */
const PLAYBOOK_TTL_MS = 25_000

export async function getPlaybookCandles(
  symbol: string,
  options: { bypassCache?: boolean } = {},
): Promise<PlaybookPack> {
  if (!options.bypassCache) {
    const cached = playbookCache.get(symbol)
    if (cached && Date.now() - cached.at < PLAYBOOK_TTL_MS) return cached.data
  }

  const [oneHour, fifteenMinute, fiveMinute, oneMinute] = await Promise.all([
    getCandles(symbol, '1h'),
    getCandles(symbol, '15m'),
    getCandles(symbol, '5m'),
    getCandles(symbol, '1m', 120),
  ])

  const data: PlaybookPack = {
    '4h': aggregateTo4h(oneHour),
    '1h': oneHour,
    '15m': fifteenMinute,
    '5m': fiveMinute,
    '1m': oneMinute,
  }
  playbookCache.set(symbol, { at: Date.now(), data })
  return data
}

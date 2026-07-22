import type { Candle, Interval } from './types'

/** Instrumentos CFD Trading 212 → símbolo Yahoo (OHLC). */
export type T212Instrument = {
  id: string
  /** Nome na T212 / pesquisa. */
  t212Label: string
  /** Pesquisa T212. */
  t212Search: string
  yahooSymbol: string
  kind: 'index' | 'forex' | 'metal' | 'energy'
  short: string
}

export const T212_INSTRUMENTS: T212Instrument[] = [
  {
    id: 'tech100',
    t212Label: 'USA Tech 100',
    t212Search: 'US100 / TECH100',
    yahooSymbol: '^NDX',
    kind: 'index',
    short: 'TECH100',
  },
  {
    id: 'us500',
    t212Label: 'USA 500',
    t212Search: 'US500',
    yahooSymbol: '^GSPC',
    kind: 'index',
    short: 'US500',
  },
  {
    id: 'us30',
    t212Label: 'USA 30',
    t212Search: 'US30 / Wall Street',
    yahooSymbol: '^DJI',
    kind: 'index',
    short: 'US30',
  },
  {
    id: 'ger40',
    t212Label: 'Germany 40',
    t212Search: 'GER40 / DAX',
    yahooSymbol: '^GDAXI',
    kind: 'index',
    short: 'GER40',
  },
  {
    id: 'uk100',
    t212Label: 'UK 100',
    t212Search: 'UK100 / FTSE',
    yahooSymbol: '^FTSE',
    kind: 'index',
    short: 'UK100',
  },
  {
    id: 'eurusd',
    t212Label: 'EUR/USD',
    t212Search: 'EURUSD',
    yahooSymbol: 'EURUSD=X',
    kind: 'forex',
    short: 'EURUSD',
  },
  {
    id: 'gbpusd',
    t212Label: 'GBP/USD',
    t212Search: 'GBPUSD',
    yahooSymbol: 'GBPUSD=X',
    kind: 'forex',
    short: 'GBPUSD',
  },
  {
    id: 'usdjpy',
    t212Label: 'USD/JPY',
    t212Search: 'USDJPY',
    yahooSymbol: 'USDJPY=X',
    kind: 'forex',
    short: 'USDJPY',
  },
  {
    id: 'xauusd',
    t212Label: 'Gold',
    t212Search: 'XAUUSD / Gold',
    yahooSymbol: 'GC=F',
    kind: 'metal',
    short: 'XAUUSD',
  },
  {
    id: 'xagusd',
    t212Label: 'Silver',
    t212Search: 'XAGUSD / Silver',
    yahooSymbol: 'SI=F',
    kind: 'metal',
    short: 'XAGUSD',
  },
  {
    id: 'oil',
    t212Label: 'US Crude',
    t212Search: 'OIL / USOIL / CL',
    yahooSymbol: 'CL=F',
    kind: 'energy',
    short: 'OIL',
  },
]

/** Extras opcionais (utilizador liga na watchlist). */
export const T212_EXTRA_INSTRUMENTS: T212Instrument[] = [
  {
    id: 'fra40',
    t212Label: 'France 40',
    t212Search: 'FRA40 / CAC',
    yahooSymbol: '^FCHI',
    kind: 'index',
    short: 'FRA40',
  },
  {
    id: 'eu50',
    t212Label: 'EU 50',
    t212Search: 'EU50 / EURO STOXX',
    yahooSymbol: '^STOXX50E',
    kind: 'index',
    short: 'EU50',
  },
  {
    id: 'jp225',
    t212Label: 'Japan 225',
    t212Search: 'JP225 / Nikkei',
    yahooSymbol: '^N225',
    kind: 'index',
    short: 'JP225',
  },
  {
    id: 'audusd',
    t212Label: 'AUD/USD',
    t212Search: 'AUDUSD',
    yahooSymbol: 'AUDUSD=X',
    kind: 'forex',
    short: 'AUDUSD',
  },
  {
    id: 'usdchf',
    t212Label: 'USD/CHF',
    t212Search: 'USDCHF',
    yahooSymbol: 'USDCHF=X',
    kind: 'forex',
    short: 'USDCHF',
  },
  {
    id: 'eurjpy',
    t212Label: 'EUR/JPY',
    t212Search: 'EURJPY',
    yahooSymbol: 'EURJPY=X',
    kind: 'forex',
    short: 'EURJPY',
  },
  {
    id: 'copper',
    t212Label: 'Copper',
    t212Search: 'COPPER / HG',
    yahooSymbol: 'HG=F',
    kind: 'metal',
    short: 'COPPER',
  },
  {
    id: 'ngas',
    t212Label: 'Natural Gas',
    t212Search: 'NATGAS / NG',
    yahooSymbol: 'NG=F',
    kind: 'energy',
    short: 'NGAS',
  },
]

/** Catálogo completo (core + extras). */
export const T212_CATALOG: T212Instrument[] = [...T212_INSTRUMENTS, ...T212_EXTRA_INSTRUMENTS]

export const T212_CORE_IDS = T212_INSTRUMENTS.map((item) => item.id)

export const DEFAULT_T212_INSTRUMENT = T212_INSTRUMENTS[0]

const WATCHLIST_KEY = 't212-watchlist-ids'

export function instrumentById(id: string): T212Instrument | undefined {
  return T212_CATALOG.find((item) => item.id === id)
}

/** Core sempre activo; extras = ids guardados que existem no catálogo. */
export function readT212WatchlistIds(): string[] {
  const core = [...T212_CORE_IDS]
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    if (!raw) return core
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return core
    const extras = parsed
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => T212_EXTRA_INSTRUMENTS.some((item) => item.id === id))
    return [...core, ...extras.filter((id, index, all) => all.indexOf(id) === index)]
  } catch {
    return core
  }
}

export function writeT212WatchlistIds(ids: string[]) {
  const extras = ids.filter((id) => T212_EXTRA_INSTRUMENTS.some((item) => item.id === id))
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(extras))
  } catch {
    /* ignore */
  }
}

export function resolveT212Watchlist(ids: string[]): T212Instrument[] {
  const unique = [...new Set([...T212_CORE_IDS, ...ids])]
  return unique
    .map((id) => instrumentById(id))
    .filter((item): item is T212Instrument => Boolean(item))
}

/** SMT obrigatório só em índices (Conservador/Equilibrado); forex/metal/energia = informativo. */
export function t212RequireSmtAlign(instrument: T212Instrument, profileRequires: boolean): boolean {
  if (!profileRequires) return false
  return instrument.kind === 'index'
}

const yahooInterval: Record<Interval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '60m',
  '4h': '60m',
  '1d': '1d',
}

const yahooRange: Record<Interval, string> = {
  '1m': '7d',
  '5m': '60d',
  '15m': '60d',
  '1h': '60d',
  '4h': '60d',
  '1d': '2y',
}

type YahooChartResponse = {
  chart?: {
    result?: {
      timestamp?: number[]
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] }
    }[]
    error?: { description?: string }
  }
}

export function parseYahooChart(payload: YahooChartResponse): Candle[] {
  const result = payload.chart?.result?.[0]
  if (!result?.timestamp?.length) {
    const err = payload.chart?.error?.description
    throw new Error(err || 'Yahoo sem candles para este símbolo.')
  }
  const quote = result.indicators?.quote?.[0]
  if (!quote) throw new Error('Yahoo sem OHLC.')
  const candles: Candle[] = []
  for (let i = 0; i < result.timestamp.length; i += 1) {
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    if (open == null || high == null || low == null || close == null) continue
    candles.push({
      openTime: result.timestamp[i] * 1000,
      open,
      high,
      low,
      close,
      volume: quote.volume?.[i] ?? 0,
    })
  }
  return candles
}

/** Agrega 1h → 4h (sessão alinhada ao openTime). */
export function aggregateTo4h(hourly: Candle[]): Candle[] {
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

export async function fetchYahooCandlesRaw(yahooSymbol: string, interval: Interval): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol: yahooSymbol,
    interval: yahooInterval[interval],
    range: yahooRange[interval],
  })
  const response = await fetch(`/api/yahoo-candles?${params}`, {
    signal: AbortSignal.timeout(18_000),
  })
  const payload = (await response.json().catch(() => ({}))) as YahooChartResponse & { error?: string; detail?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Yahoo ${response.status} (${yahooSymbol})`)
  }
  try {
    const candles = parseYahooChart(payload)
    if (interval === '4h') return aggregateTo4h(candles)
    return candles
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : `Yahoo sem dados (${yahooSymbol})`)
  }
}

type PlaybookPack = Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>

const playbookCache = new Map<string, { at: number; data: PlaybookPack }>()
const PLAYBOOK_TTL_MS = 90_000

type YahooPackResponse = {
  symbol?: string
  charts?: Partial<Record<'1h' | '15m' | '5m' | '1m', YahooChartResponse>>
  error?: string
}

async function fetchPlaybookViaPack(yahooSymbol: string): Promise<PlaybookPack> {
  const response = await fetch(`/api/yahoo-pack?symbol=${encodeURIComponent(yahooSymbol)}`, {
    signal: AbortSignal.timeout(22_000),
  })
  const payload = (await response.json().catch(() => ({}))) as YahooPackResponse
  if (!response.ok) throw new Error(payload.error || `Yahoo pack ${response.status}`)
  const charts = payload.charts
  if (!charts?.['1h'] || !charts['15m'] || !charts['5m']) {
    throw new Error(payload.error || `Yahoo pack incompleto (${yahooSymbol})`)
  }
  const oneHour = parseYahooChart(charts['1h'])
  const fifteenMinute = parseYahooChart(charts['15m'])
  const fiveMinute = parseYahooChart(charts['5m'])
  let oneMinute: Candle[]
  try {
    oneMinute = charts['1m'] ? parseYahooChart(charts['1m']) : fiveMinute
  } catch {
    oneMinute = fiveMinute
  }
  return {
    '4h': aggregateTo4h(oneHour),
    '1h': oneHour,
    '15m': fifteenMinute,
    '5m': fiveMinute,
    '1m': oneMinute,
  }
}

async function fetchPlaybookLegacy(yahooSymbol: string): Promise<PlaybookPack> {
  const [oneHour, fifteenMinute, fiveMinute, oneMinuteOrNull] = await Promise.all([
    fetchYahooCandlesRaw(yahooSymbol, '1h'),
    fetchYahooCandlesRaw(yahooSymbol, '15m'),
    fetchYahooCandlesRaw(yahooSymbol, '5m'),
    fetchYahooCandlesRaw(yahooSymbol, '1m').catch(() => null),
  ])
  return {
    '4h': aggregateTo4h(oneHour),
    '1h': oneHour,
    '15m': fifteenMinute,
    '5m': fiveMinute,
    '1m': oneMinuteOrNull ?? fiveMinute,
  }
}

/** Candles MTF: 1 pedido pack (fallback 4 pedidos) + cache 90s. */
export async function getT212PlaybookCandles(instrument: T212Instrument = DEFAULT_T212_INSTRUMENT): Promise<PlaybookPack> {
  const cached = playbookCache.get(instrument.yahooSymbol)
  if (cached && Date.now() - cached.at < PLAYBOOK_TTL_MS) return cached.data

  let data: PlaybookPack
  try {
    data = await fetchPlaybookViaPack(instrument.yahooSymbol)
  } catch {
    data = await fetchPlaybookLegacy(instrument.yahooSymbol)
  }
  playbookCache.set(instrument.yahooSymbol, { at: Date.now(), data })
  return data
}

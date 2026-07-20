import type { Candle, Interval } from './types'

/** Instrumentos CFD Trading 212 → símbolo Yahoo (OHLC). */
export type T212Instrument = {
  id: string
  /** Nome na T212 / pesquisa. */
  t212Label: string
  /** Pesquisa T212. */
  t212Search: string
  yahooSymbol: string
  kind: 'index' | 'forex' | 'metal'
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
    id: 'xauusd',
    t212Label: 'Gold',
    t212Search: 'XAUUSD / Gold',
    yahooSymbol: 'GC=F',
    kind: 'metal',
    short: 'XAUUSD',
  },
]

export const DEFAULT_T212_INSTRUMENT = T212_INSTRUMENTS[0]

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
  '1h': '730d',
  '4h': '730d',
  '1d': 'max',
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
  const response = await fetch(`/api/yahoo-candles?${params}`)
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

export async function getT212PlaybookCandles(instrument: T212Instrument = DEFAULT_T212_INSTRUMENT) {
  const [oneHour, fifteenMinute, fiveMinute] = await Promise.all([
    fetchYahooCandlesRaw(instrument.yahooSymbol, '1h'),
    fetchYahooCandlesRaw(instrument.yahooSymbol, '15m'),
    fetchYahooCandlesRaw(instrument.yahooSymbol, '5m'),
  ])
  let oneMinute: Candle[]
  try {
    oneMinute = await fetchYahooCandlesRaw(instrument.yahooSymbol, '1m')
  } catch {
    oneMinute = fiveMinute
  }
  const fourHour = aggregateTo4h(oneHour)
  return {
    '4h': fourHour,
    '1h': oneHour,
    '15m': fifteenMinute,
    '5m': fiveMinute,
    '1m': oneMinute,
  } as const
}

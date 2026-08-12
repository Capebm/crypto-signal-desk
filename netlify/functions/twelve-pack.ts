import type { Handler, HandlerEvent } from '@netlify/functions'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const SPECS = [
  { key: '1h' as const, interval: '1h', outputsize: 300 },
  { key: '15m' as const, interval: '15min', outputsize: 300 },
  { key: '5m' as const, interval: '5min', outputsize: 300 },
  { key: '1m' as const, interval: '1min', outputsize: 250 },
]

type TwelveValue = {
  datetime?: string
  open?: string
  high?: string
  low?: string
  close?: string
  volume?: string
}

type TwelveSeries = {
  status?: string
  code?: number
  message?: string
  meta?: {
    symbol?: string
    type?: string
    exchange?: string
  }
  values?: TwelveValue[]
}

type CandleDto = {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const isQuota = (status: number, body: TwelveSeries) =>
  status === 429
  || body.code === 429
  || /credit|quota|limit|rate/i.test(body.message ?? '')

const typeMatchesKind = (type: string | undefined, kind: string | undefined) => {
  if (!kind) return true
  const normalized = (type ?? '').toLowerCase()
  if (kind === 'forex') return normalized.includes('currency')
  if (kind === 'crypto') return normalized.includes('digital') || normalized.includes('crypto')
  if (kind === 'index') return normalized.includes('index')
  if (kind === 'stock') {
    return normalized.includes('stock')
      || normalized.includes('common')
      || normalized.includes('depositary')
      || normalized.includes('reit')
  }
  if (kind === 'metal' || kind === 'energy') {
    return normalized.includes('metal')
      || normalized.includes('energy')
      || normalized.includes('commodity')
  }
  return false
}

function parseSeries(body: TwelveSeries): CandleDto[] {
  if (!body.values?.length) throw new Error(body.message || 'Twelve sem candles')
  const candles: CandleDto[] = []
  for (const row of body.values) {
    if (!row.datetime || row.open == null || row.high == null || row.low == null || row.close == null) continue
    const openTime = Date.parse(row.datetime.includes('T') ? row.datetime : row.datetime.replace(' ', 'T'))
    if (!Number.isFinite(openTime)) continue
    const open = Number(row.open)
    const high = Number(row.high)
    const low = Number(row.low)
    const close = Number(row.close)
    if (![open, high, low, close].every(Number.isFinite)) continue
    candles.push({
      openTime,
      open,
      high,
      low,
      close,
      volume: Number(row.volume) || 0,
    })
  }
  // Twelve devolve do mais recente → mais antigo
  return candles.sort((a, b) => a.openTime - b.openTime)
}

async function fetchInterval(apiKey: string, symbol: string, interval: string, outputsize: number) {
  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(outputsize),
    apikey: apiKey,
    timezone: 'UTC',
  })
  const response = await fetch(`https://api.twelvedata.com/time_series?${params}`)
  const body = (await response.json().catch(() => ({}))) as TwelveSeries
  return { response, body }
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim()
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'TWELVE_DATA_API_KEY em falta', skip: true }),
    }
  }

  const symbol = event.queryStringParameters?.symbol?.trim()
  const expectedKind = event.queryStringParameters?.kind?.trim()
  if (!symbol || symbol.length > 40) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbol inválido' }) }
  }

  try {
    const candles: Partial<Record<'1h' | '15m' | '5m' | '1m', CandleDto[]>> = {}
    const errors: string[] = []

    // Sequencial: free tier = 8 créditos/min; 4 intervalos = 4 créditos por pack.
    for (const spec of SPECS) {
      const { response, body } = await fetchInterval(apiKey, symbol, spec.interval, spec.outputsize)
      if (isQuota(response.status, body)) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            error: body.message || 'Twelve créditos/rate limit',
            quota: true,
            symbol,
          }),
        }
      }
      if (body.status === 'error' || !response.ok) {
        errors.push(`${spec.key}: ${body.message || `HTTP ${response.status}`}`)
        continue
      }
      if (!typeMatchesKind(body.meta?.type, expectedKind)) {
        errors.push(`${spec.key}: Twelve resolveu ${symbol} como ${body.meta?.type ?? 'tipo desconhecido'} — esperado ${expectedKind}`)
        continue
      }
      try {
        candles[spec.key] = parseSeries(body)
      } catch (error) {
        errors.push(`${spec.key}: ${error instanceof Error ? error.message : 'parse'}`)
      }
    }

    if (!candles['1h']?.length || !candles['15m']?.length || !candles['5m']?.length) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: errors[0] || `Twelve pack incompleto (${symbol})`, symbol, errors }),
      }
    }

    if (!candles['1m']?.length) candles['1m'] = candles['5m']

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ source: 'twelve', symbol, candles, warnings: errors.length ? errors : undefined }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Twelve pack failed'
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) }
  }
}

import type { Handler, HandlerEvent } from '@netlify/functions'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
}

/** Um round-trip: 1h + 15m + 5m + 1m em paralelo no servidor. */
const SPECS = [
  { key: '1h' as const, interval: '60m', range: '60d' },
  { key: '15m' as const, interval: '15m', range: '60d' },
  { key: '5m' as const, interval: '5m', range: '60d' },
  { key: '1m' as const, interval: '1m', range: '7d' },
]

async function fetchChart(symbol: string, interval: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
  const response = await fetch(url, { headers: YAHOO_HEADERS })
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { chart: { error: { description: 'Yahoo JSON inválido' } } }
  }
  return { ok: response.ok, status: response.status, payload }
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const symbol = event.queryStringParameters?.symbol?.trim()
  if (!symbol || symbol.length > 32) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbol inválido' }) }
  }

  try {
    const settled = await Promise.all(
      SPECS.map(async (spec) => {
        const result = await fetchChart(symbol, spec.interval, spec.range)
        return { key: spec.key, ...result }
      }),
    )

    const charts: Record<string, unknown> = {}
    const errors: string[] = []
    for (const row of settled) {
      if (!row.ok) {
        const desc = (row.payload as { chart?: { error?: { description?: string } } })?.chart?.error?.description
        errors.push(`${row.key}: Yahoo ${row.status}${desc ? ` — ${desc}` : ''}`)
        continue
      }
      charts[row.key] = row.payload
    }

    if (!charts['1h'] || !charts['15m'] || !charts['5m']) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: errors[0] || `Yahoo pack incompleto (${symbol})`, symbol, errors }),
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ symbol, charts, warnings: errors.length ? errors : undefined }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Yahoo pack failed'
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) }
  }
}

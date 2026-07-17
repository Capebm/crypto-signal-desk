import type { Handler, HandlerEvent } from '@netlify/functions'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const ALLOWED = new Set(['1m', '5m', '15m', '60m', '1h', '1d'])
const RANGES = new Set(['1d', '5d', '7d', '60d', '730d', 'max', '1mo', '3mo', '1y', '2y', '5y'])

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const symbol = event.queryStringParameters?.symbol?.trim()
  const interval = event.queryStringParameters?.interval?.trim() ?? '15m'
  const range = event.queryStringParameters?.range?.trim() ?? '60d'

  if (!symbol || symbol.length > 32) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbol inválido' }) }
  }
  if (!ALLOWED.has(interval) || !RANGES.has(range)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'interval/range inválido' }) }
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CSD-Desk/1.0)',
        Accept: 'application/json',
      },
    })
    const text = await response.text()
    if (!response.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: `Yahoo ${response.status}`, detail: text.slice(0, 200) }),
      }
    }
    return { statusCode: 200, headers, body: text }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Yahoo fetch failed'
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) }
  }
}

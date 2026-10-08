import type { HandlerEvent } from '@netlify/functions'
import { capitalEnv, fetchCapitalPackResolving, searchCapitalMarkets } from '../../server/capital'
import { API_HEADERS, withDeskAuth } from '../../server/desk-auth'

const headers = API_HEADERS

export const handler = withDeskAuth(async (event: HandlerEvent) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }
  const env = capitalEnv()
  if (!env) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Capital.com não configurada', skip: true }) }
  }

  const search = event.queryStringParameters?.search?.trim()
  const epic = event.queryStringParameters?.epic?.trim().toUpperCase()
  const name = event.queryStringParameters?.name?.trim().slice(0, 40)
  try {
    if (search) {
      if (search.length > 40) return { statusCode: 400, headers, body: JSON.stringify({ error: 'search inválido' }) }
      return { statusCode: 200, headers, body: JSON.stringify({ markets: await searchCapitalMarkets(env, search) }) }
    }
    if (!epic || !/^[A-Z0-9_.]{2,24}$/.test(epic)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'epic inválido' }) }
    }
    const resolved = await fetchCapitalPackResolving(env, epic, name)
    const { candles } = resolved
    if (!candles['1h']?.length || !candles['5m']?.length || !candles['1m']?.length) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Capital.com sem velas (${resolved.epic})`, epic: resolved.epic }) }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ source: 'capital', epic: resolved.epic, requested: epic, candles }) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Capital.com falhou'
    return { statusCode: 502, headers, body: JSON.stringify({ error: message, epic }) }
  }
})

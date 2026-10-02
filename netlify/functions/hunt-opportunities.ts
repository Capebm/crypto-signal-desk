import type { HandlerEvent } from '@netlify/functions'
import { API_HEADERS, withDeskAuth } from '../../server/desk-auth'
import { cleanEstimateCandidate, estimateResale } from '../../server/hunt'

const headers = API_HEADERS

export const handler = withDeskAuth(async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) }
  }

  if ((event.body?.length ?? 0) > 2_000) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: 'Pedido demasiado grande' }) }
  }

  try {
    // Só a estimativa PT (1 chamada Haiku). O hunt mundial com Anthropic saiu da API: a UI usa os scrapers grátis.
    const body = JSON.parse(event.body ?? '{}') as { candidate?: unknown }
    const candidate = cleanEstimateCandidate(body.candidate)
    if (!candidate) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }
    }
    const result = await estimateResale(candidate, apiKey)
    return { statusCode: 200, headers, body: JSON.stringify(result) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) }
  }
})

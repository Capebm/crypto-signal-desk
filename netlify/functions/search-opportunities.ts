import type { Handler, HandlerEvent } from '@netlify/functions'
import { searchOpportunities } from '../../server/analyze'
import type { SearchRequest } from '../../server/types'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const params: SearchRequest =
      event.httpMethod === 'GET'
        ? {
            query: event.queryStringParameters?.query ?? '',
            sourceIds: event.queryStringParameters?.sourceIds?.split(',').filter(Boolean),
            bundlesOnly: event.queryStringParameters?.bundlesOnly === 'true',
            minProfitPct: Number(event.queryStringParameters?.minProfitPct ?? 25),
            maxBuyPrice: Number(event.queryStringParameters?.maxBuyPrice ?? 0),
            packagingCost: Number(event.queryStringParameters?.packagingCost ?? 2),
            limit: Number(event.queryStringParameters?.limit ?? 20),
          }
        : (JSON.parse(event.body ?? '{}') as SearchRequest)

    const result = await searchOpportunities(params)
    return { statusCode: 200, headers, body: JSON.stringify(result) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed'
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) }
  }
}

import type { Handler, HandlerEvent } from '@netlify/functions'
import { huntOpportunities, estimateResale, huntBatch } from '../../server/hunt'
import type { HuntBrief, HuntSettings } from '../../server/types'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) }
  }

  try {
    const body = JSON.parse(event.body ?? '{}') as {
      brief?: HuntBrief
      settings?: HuntSettings
      candidate?: Parameters<typeof estimateResale>[0]
      angle?: string
      batchTag?: string
      perBatch?: number
    }

    if (body.candidate) {
      const result = await estimateResale(body.candidate, apiKey)
      return { statusCode: 200, headers, body: JSON.stringify(result) }
    }

    if (body.brief && body.settings && body.angle) {
      const result = await huntBatch(
        body.brief,
        body.angle,
        body.batchTag ?? 'b0',
        body.perBatch ?? 3,
        body.settings,
        apiKey,
      )
      return { statusCode: 200, headers, body: JSON.stringify(result) }
    }

    if (body.brief && body.settings) {
      const result = await huntOpportunities(body.brief, body.settings, apiKey)
      return { statusCode: 200, headers, body: JSON.stringify(result) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) }
  }
}

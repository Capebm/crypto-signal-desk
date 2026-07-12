import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { searchOpportunities } from './server/analyze'
import { estimateResale, huntBatch, huntOpportunities } from './server/hunt'
import type { HuntBrief, HuntSettings, SearchRequest } from './server/types'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function getApiKey(env: Record<string, string>) {
  return env.ANTHROPIC_API_KEY || ''
}

export function garimpoApiPlugin(): Plugin {
  return {
    name: 'garimpo-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir, '')
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        if (url.pathname === '/api/search' && req.method === 'GET') {
          const sourceIds = url.searchParams.get('sourceIds')?.split(',').filter(Boolean)
          const request: SearchRequest = {
            query: url.searchParams.get('query') ?? '',
            sourceIds,
            bundlesOnly: url.searchParams.get('bundlesOnly') === 'true',
            minProfitPct: Number(url.searchParams.get('minProfitPct') ?? 25),
            maxBuyPrice: Number(url.searchParams.get('maxBuyPrice') ?? 0),
            packagingCost: Number(url.searchParams.get('packagingCost') ?? 2),
            limit: Number(url.searchParams.get('limit') ?? 20),
          }
          try {
            sendJson(res, 200, await searchOpportunities(request))
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : 'Search failed' })
          }
          return
        }

        if (url.pathname === '/api/hunt' && req.method === 'POST') {
          const apiKey = getApiKey(env)
          if (!apiKey) {
            sendJson(res, 500, { error: 'ANTHROPIC_API_KEY em falta — define no .env' })
            return
          }
          try {
            const body = JSON.parse(await readBody(req)) as {
              brief: HuntBrief
              settings: HuntSettings
              angle?: string
              batchTag?: string
              perBatch?: number
            }
            if (body.angle) {
              sendJson(
                res,
                200,
                await huntBatch(
                  body.brief,
                  body.angle,
                  body.batchTag ?? 'b0',
                  body.perBatch ?? 3,
                  body.settings,
                  apiKey,
                ),
              )
              return
            }
            sendJson(res, 200, await huntOpportunities(body.brief, body.settings, apiKey))
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : 'Hunt failed' })
          }
          return
        }

        if (url.pathname === '/api/estimate' && req.method === 'POST') {
          const apiKey = getApiKey(env)
          if (!apiKey) {
            sendJson(res, 500, { error: 'ANTHROPIC_API_KEY em falta — define no .env' })
            return
          }
          try {
            const body = JSON.parse(await readBody(req)) as Parameters<typeof estimateResale>[0]
            sendJson(res, 200, await estimateResale(body, apiKey))
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : 'Estimate failed' })
          }
          return
        }

        next()
      })
    },
  }
}

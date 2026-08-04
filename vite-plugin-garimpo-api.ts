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

function getTwelveKey(env: Record<string, string>) {
  return env.TWELVE_DATA_API_KEY?.trim() || ''
}

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
  values?: TwelveValue[]
}

function parseTwelveSeries(body: TwelveSeries) {
  if (!body.values?.length) throw new Error(body.message || 'Twelve sem candles')
  const candles = body.values
    .map((row) => {
      if (!row.datetime || row.open == null || row.high == null || row.low == null || row.close == null) return null
      const openTime = Date.parse(row.datetime.includes('T') ? row.datetime : row.datetime.replace(' ', 'T'))
      if (!Number.isFinite(openTime)) return null
      const open = Number(row.open)
      const high = Number(row.high)
      const low = Number(row.low)
      const close = Number(row.close)
      if (![open, high, low, close].every(Number.isFinite)) return null
      return { openTime, open, high, low, close, volume: Number(row.volume) || 0 }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.openTime - b.openTime)
  if (!candles.length) throw new Error('Twelve sem candles válidas')
  return candles
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

        if (url.pathname === '/api/yahoo-candles' && req.method === 'GET') {
          const symbol = url.searchParams.get('symbol')?.trim()
          const interval = url.searchParams.get('interval')?.trim() ?? '15m'
          const range = url.searchParams.get('range')?.trim() ?? '60d'
          if (!symbol) {
            sendJson(res, 400, { error: 'symbol inválido' })
            return
          }
          try {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
            const response = await fetch(yahooUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'application/json,text/plain,*/*',
              },
            })
            const text = await response.text()
            if (!response.ok) {
              let yahooMsg = ''
              try {
                const parsed = JSON.parse(text) as { chart?: { error?: { description?: string } } }
                yahooMsg = parsed.chart?.error?.description ? ` — ${parsed.chart.error.description}` : ''
              } catch {
                /* ignore */
              }
              sendJson(res, 502, { error: `Yahoo ${response.status}${yahooMsg}`, symbol })
              return
            }
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : 'Yahoo fetch failed' })
          }
          return
        }

        if (url.pathname === '/api/yahoo-pack' && req.method === 'GET') {
          const symbol = url.searchParams.get('symbol')?.trim()
          if (!symbol) {
            sendJson(res, 400, { error: 'symbol inválido' })
            return
          }
          const yahooHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json,text/plain,*/*',
          }
          const specs = [
            { key: '1h', interval: '60m', range: '60d' },
            { key: '15m', interval: '15m', range: '60d' },
            { key: '5m', interval: '5m', range: '60d' },
            { key: '1m', interval: '1m', range: '7d' },
          ] as const
          try {
            const settled = await Promise.all(
              specs.map(async (spec) => {
                const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(spec.interval)}&range=${encodeURIComponent(spec.range)}`
                const response = await fetch(yahooUrl, { headers: yahooHeaders })
                const payload = await response.json().catch(() => ({ chart: { error: { description: 'JSON inválido' } } }))
                return { key: spec.key, ok: response.ok, status: response.status, payload }
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
              sendJson(res, 502, { error: errors[0] || `Yahoo pack incompleto (${symbol})`, symbol, errors })
              return
            }
            sendJson(res, 200, { symbol, charts, warnings: errors.length ? errors : undefined })
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : 'Yahoo pack failed' })
          }
          return
        }

        if (url.pathname === '/api/twelve-pack' && req.method === 'GET') {
          const apiKey = getTwelveKey(env)
          if (!apiKey) {
            sendJson(res, 503, { error: 'TWELVE_DATA_API_KEY em falta', skip: true })
            return
          }
          const symbol = url.searchParams.get('symbol')?.trim()
          if (!symbol) {
            sendJson(res, 400, { error: 'symbol inválido' })
            return
          }
          const specs = [
            { key: '1h', interval: '1h', outputsize: 300 },
            { key: '15m', interval: '15min', outputsize: 300 },
            { key: '5m', interval: '5min', outputsize: 300 },
            { key: '1m', interval: '1min', outputsize: 250 },
          ] as const
          try {
            const candles: Record<string, unknown> = {}
            const errors: string[] = []
            for (const spec of specs) {
              const params = new URLSearchParams({
                symbol,
                interval: spec.interval,
                outputsize: String(spec.outputsize),
                apikey: apiKey,
                timezone: 'UTC',
              })
              const response = await fetch(`https://api.twelvedata.com/time_series?${params}`)
              const body = (await response.json().catch(() => ({}))) as TwelveSeries
              const quota = response.status === 429
                || body.code === 429
                || /credit|quota|limit|rate/i.test(body.message ?? '')
              if (quota) {
                sendJson(res, 429, { error: body.message || 'Twelve créditos/rate limit', quota: true, symbol })
                return
              }
              if (body.status === 'error' || !response.ok) {
                errors.push(`${spec.key}: ${body.message || `HTTP ${response.status}`}`)
                continue
              }
              try {
                candles[spec.key] = parseTwelveSeries(body)
              } catch (error) {
                errors.push(`${spec.key}: ${error instanceof Error ? error.message : 'parse'}`)
              }
            }
            if (!Array.isArray(candles['1h']) || !Array.isArray(candles['15m']) || !Array.isArray(candles['5m'])) {
              sendJson(res, 502, { error: errors[0] || `Twelve pack incompleto (${symbol})`, symbol, errors })
              return
            }
            if (!Array.isArray(candles['1m']) || !(candles['1m'] as unknown[]).length) {
              candles['1m'] = candles['5m']
            }
            sendJson(res, 200, { source: 'twelve', symbol, candles, warnings: errors.length ? errors : undefined })
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : 'Twelve pack failed' })
          }
          return
        }

        next()
      })
    },
  }
}

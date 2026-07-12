import type { HuntBrief, HuntCandidate, HuntResponse, HuntSettings } from '../../../server/types'
import { getHuntAngles, mergeHuntResults } from '../../../server/hunt-angles'

const API = {
  hunt: '/api/hunt',
  estimate: '/api/estimate',
  search: '/api/search',
}

async function parseError(res: Response, fallback: string) {
  const text = await res.text()
  try {
    const payload = JSON.parse(text) as { error?: string; errorMessage?: string }
    return payload.error ?? payload.errorMessage ?? fallback
  } catch {
    return text.slice(0, 120) || fallback
  }
}

export async function fetchScrape(request: import('../../../server/types').SearchRequest) {
  const params = new URLSearchParams()
  if (request.query) params.set('query', request.query)
  if (request.sourceIds?.length) params.set('sourceIds', request.sourceIds.join(','))
  if (request.bundlesOnly) params.set('bundlesOnly', 'true')
  if (request.minProfitPct !== undefined) params.set('minProfitPct', String(request.minProfitPct))
  if (request.maxBuyPrice) params.set('maxBuyPrice', String(request.maxBuyPrice))
  if (request.packagingCost !== undefined) params.set('packagingCost', String(request.packagingCost))
  if (request.limit !== undefined) params.set('limit', String(request.limit))

  const res = await fetch(`${API.search}?${params}`)
  if (!res.ok) throw new Error(await parseError(res, `Scrapers falharam (${res.status})`))
  return res.json()
}

async function fetchHuntBatch(
  brief: HuntBrief,
  settings: HuntSettings,
  angle: string,
  batchTag: string,
  perBatch: number,
) {
  const res = await fetch(API.hunt, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, settings, angle, batchTag, perBatch }),
  })
  if (!res.ok) throw new Error(await parseError(res, `Caça falhou (${res.status})`))
  return res.json() as Promise<{ items: HuntCandidate[]; failed: boolean }>
}

/** Runs one Netlify-safe batch per request to avoid 30s function timeout. */
export async function fetchHunt(brief: HuntBrief, settings: HuntSettings): Promise<HuntResponse> {
  const target = settings.huntTarget || 20
  const angles = getHuntAngles(brief)
  const perBatch = Math.min(3, Math.max(2, Math.ceil(target / angles.length)))

  const batches = await Promise.all(
    angles.map((angle, i) => fetchHuntBatch(brief, settings, angle, `b${i}`, perBatch)),
  )

  return mergeHuntResults(batches, target)
}

export async function fetchEstimate(
  candidate: Pick<HuntCandidate, 'name' | 'category' | 'size' | 'condition'>,
): Promise<NonNullable<HuntCandidate['ai']>> {
  const res = await fetch(API.estimate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate }),
  })
  if (!res.ok) throw new Error(await parseError(res, `Estimativa falhou (${res.status})`))
  return res.json() as Promise<NonNullable<HuntCandidate['ai']>>
}

export type { HuntBrief, HuntCandidate, HuntResponse, HuntSettings, SearchRequest, SearchResponse, Opportunity } from '../../../server/types'

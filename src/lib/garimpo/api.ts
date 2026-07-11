import type { HuntBrief, HuntCandidate, HuntResponse, HuntSettings, SearchRequest, SearchResponse } from '../../../server/types'

const API = {
  hunt: '/api/hunt',
  estimate: '/api/estimate',
  search: '/api/search',
}

export async function fetchScrape(request: SearchRequest): Promise<SearchResponse> {
  const params = new URLSearchParams()
  if (request.query) params.set('query', request.query)
  if (request.sourceIds?.length) params.set('sourceIds', request.sourceIds.join(','))
  if (request.bundlesOnly) params.set('bundlesOnly', 'true')
  if (request.minProfitPct !== undefined) params.set('minProfitPct', String(request.minProfitPct))
  if (request.maxBuyPrice) params.set('maxBuyPrice', String(request.maxBuyPrice))
  if (request.packagingCost !== undefined) params.set('packagingCost', String(request.packagingCost))
  if (request.limit !== undefined) params.set('limit', String(request.limit))

  const res = await fetch(`${API.search}?${params}`)
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `Scrapers falharam (${res.status})`)
  }
  return res.json() as Promise<SearchResponse>
}

export async function fetchHunt(brief: HuntBrief, settings: HuntSettings): Promise<HuntResponse> {
  const res = await fetch(API.hunt, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, settings }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `Caça falhou (${res.status})`)
  }
  return res.json() as Promise<HuntResponse>
}

export async function fetchEstimate(
  candidate: Pick<HuntCandidate, 'name' | 'category' | 'size' | 'condition'>,
): Promise<NonNullable<HuntCandidate['ai']>> {
  const res = await fetch(API.estimate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(candidate),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `Estimativa falhou (${res.status})`)
  }
  return res.json() as Promise<NonNullable<HuntCandidate['ai']>>
}

export type { HuntBrief, HuntCandidate, HuntResponse, HuntSettings, SearchRequest, SearchResponse, Opportunity } from '../../../server/types'

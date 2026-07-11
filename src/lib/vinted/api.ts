import type { SearchRequest, SearchResponse } from '../../../server/types'

const API_PATH = '/api/search'

export async function fetchOpportunities(request: SearchRequest): Promise<SearchResponse> {
  const params = new URLSearchParams()
  if (request.query) params.set('query', request.query)
  if (request.bundlesOnly) params.set('bundlesOnly', 'true')
  if (request.minProfitPct !== undefined) params.set('minProfitPct', String(request.minProfitPct))
  if (request.maxBuyPrice) params.set('maxBuyPrice', String(request.maxBuyPrice))
  if (request.packagingCost !== undefined) params.set('packagingCost', String(request.packagingCost))
  if (request.limit !== undefined) params.set('limit', String(request.limit))

  const response = await fetch(`${API_PATH}?${params}`)
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `Pesquisa falhou (${response.status})`)
  }

  return response.json() as Promise<SearchResponse>
}

export type { Opportunity, SearchRequest, SearchResponse } from '../../../server/types'

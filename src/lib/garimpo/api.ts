import type { HuntBrief, HuntCandidate, HuntResponse, HuntSettings } from '../../../server/types'
import { briefToScraperIds, unsupportedHuntSources } from './constants'
import { opportunityToCandidate } from './helpers'
import { humanizeErrorText, humanizeErrorMessage } from './errors'

export { humanizeErrorMessage }

const API = {
  hunt: '/api/hunt',
  estimate: '/api/estimate',
  search: '/api/search',
}

async function parseError(res: Response, fallback: string) {
  const text = await res.text()
  const friendly = humanizeErrorText(text, res.status)
  if (friendly) return friendly
  try {
    const payload = JSON.parse(text) as { error?: string; errorMessage?: string }
    return payload.error ?? payload.errorMessage ?? fallback
  } catch {
    return fallback
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

function huntQuery(brief: HuntBrief): string {
  const what = brief.what.trim()
  if (what) return what
  if (brief.category !== 'Tudo') return brief.category
  return brief.lotsOnly ? 'lote roupa pack bundle' : 'lote roupa'
}

/** Free scraper hunt — Vinted + OLX APIs, compares to Vinted PT. No Anthropic calls. */
export async function fetchHunt(brief: HuntBrief, settings: HuntSettings): Promise<HuntResponse> {
  const unsupported = unsupportedHuntSources(brief.sources)
  const sourceIds = briefToScraperIds(brief.sources)

  const result = await fetchScrape({
    query: huntQuery(brief),
    sourceIds,
    bundlesOnly: brief.lotsOnly,
    minProfitPct: 10,
    maxBuyPrice: Number(brief.maxBuy) || 0,
    packagingCost: 2,
    limit: settings.huntTarget || 20,
  })

  const items = result.opportunities.map(opportunityToCandidate)
  const hint =
    unsupported.length > 0
      ? `${unsupported.join(', ')} não têm scraper automático — só Vinted/OLX são pesquisados.`
      : undefined

  return {
    items,
    allFailed: items.length === 0,
    anyFailed: result.errors.length > 0,
    batchCount: result.sourcesSearched.length,
    hint,
    scannedBuyListings: result.scannedBuyListings,
    searchErrors: result.errors,
  }
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

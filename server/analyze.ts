import { cleanSearchQuery } from './bundle'
import { searchVintedPtPrices } from './sources/vinted'
import { searchBuySources, BUY_SOURCES } from './sources/index'
import type { Opportunity, RawListing, SearchRequest, SearchResponse } from './types'

const PRESET_QUERIES = [
  'lote roupa',
  'job lot clothing',
  'pack sapatilhas',
  'lot ubran',
  'bundle sneakers',
  'lote livros',
  'conjunto bebé',
  'lote brinquedos',
]

function confidenceFromSample(sampleSize: number, marginPct: number): Opportunity['confidence'] {
  if (sampleSize >= 12 && marginPct >= 40) return 'high'
  if (sampleSize >= 6 && marginPct >= 20) return 'medium'
  return 'low'
}

function analyzeListing(
  listing: RawListing,
  packagingCost: number,
  vintedStats: Awaited<ReturnType<typeof searchVintedPtPrices>>,
  searchQuery: string,
): Opportunity | null {
  const buyPriceEur = listing.priceEur
  if (vintedStats.sampleSize < 3 || vintedStats.median <= buyPriceEur) return null

  const estimatedSellPrice = vintedStats.median
  const estimatedProfit = estimatedSellPrice - buyPriceEur - packagingCost
  const profitMarginPct = buyPriceEur > 0 ? (estimatedProfit / buyPriceEur) * 100 : 0
  if (estimatedProfit <= 0) return null

  const notes: string[] = []
  notes.push(`Fonte: ${listing.sourceName} (${listing.region === 'EU' ? 'UE' : 'fora UE'})`)
  if (listing.currency !== 'EUR') {
    notes.push(`Preço original: ${listing.price} ${listing.currency} (≈ €${buyPriceEur.toFixed(2)})`)
  }
  if (listing.isBundle) notes.push('Detetado como lote/pack — potencial para separar e vender individualmente.')
  if (listing.isBundle && listing.priceEur < 3) {
    notes.push('Preço parece ser por peça/unidade — confirma o preço total do lote no anúncio.')
  }
  if (vintedStats.sampleSize < 8) notes.push('Poucos comparáveis no Vinted PT — valida preços manualmente.')
  if (vintedStats.max / vintedStats.min > 3) notes.push('Grande variação de preços no Vinted — escolhe bem o estado/fotos.')

  return {
    id: listing.id,
    buyListing: listing,
    vintedStats,
    estimatedSellPrice,
    buyPrice: listing.price,
    buyPriceEur,
    packagingCost,
    estimatedProfit,
    profitMarginPct,
    confidence: confidenceFromSample(vintedStats.sampleSize, profitMarginPct),
    searchQuery,
    notes,
  }
}

async function analyzeListings(
  listings: RawListing[],
  options: Required<Pick<SearchRequest, 'bundlesOnly' | 'minProfitPct' | 'maxBuyPrice' | 'packagingCost' | 'limit'>>,
): Promise<{ opportunities: Opportunity[]; errors: string[] }> {
  const opportunities: Opportunity[] = []
  const errors: string[] = []
  const candidates = listings
    .filter((l) => !options.bundlesOnly || l.isBundle)
    .filter((l) => !options.maxBuyPrice || l.priceEur <= options.maxBuyPrice)
    .slice(0, options.limit * 3)

  for (const listing of candidates) {
    const query = cleanSearchQuery(listing.title)
    if (query.length < 3) continue

    try {
      const vintedStats = await searchVintedPtPrices(query)
      const opportunity = analyzeListing(listing, options.packagingCost, vintedStats, query)
      if (!opportunity) continue
      if (opportunity.profitMarginPct < options.minProfitPct) continue
      opportunities.push(opportunity)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      if (!errors.includes(message)) errors.push(message)
    }

    if (opportunities.length >= options.limit) break
  }

  opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit)
  return { opportunities, errors }
}

export async function searchOpportunities(request: SearchRequest): Promise<SearchResponse> {
  const query = request.query.trim()
  const options = {
    bundlesOnly: request.bundlesOnly ?? false,
    minProfitPct: request.minProfitPct ?? 25,
    maxBuyPrice: request.maxBuyPrice ?? 0,
    packagingCost: request.packagingCost ?? 2,
    limit: request.limit ?? 20,
  }

  const sourceIds = request.sourceIds?.length ? request.sourceIds : BUY_SOURCES.map((s) => s.id)
  const queries = query ? [query] : PRESET_QUERIES
  const allListings: RawListing[] = []
  const errors: string[] = []

  for (const q of queries) {
    const { listings, errors: sourceErrors } = await searchBuySources(q, sourceIds, 15)
    allListings.push(...listings)
    errors.push(...sourceErrors)
  }

  const unique = new Map<string, RawListing>()
  for (const listing of allListings) unique.set(listing.id, listing)

  const { opportunities, errors: analyzeErrors } = await analyzeListings([...unique.values()], options)

  return {
    query: query || 'presets',
    searchedAt: new Date().toISOString(),
    opportunities,
    scannedBuyListings: unique.size,
    sourcesSearched: sourceIds,
    errors: [...new Set([...errors, ...analyzeErrors])],
  }
}

export { PRESET_QUERIES, BUY_SOURCES }

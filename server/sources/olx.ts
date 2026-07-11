import { detectBundle } from '../bundle'
import type { RawListing } from '../types'
import type { BuySource } from './config'
import { toEur } from './config'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

interface OlxOffer {
  id: number
  url: string
  title: string
  description?: string
  params?: Array<{ key: string; type: string; value?: { value?: number; label?: string; currency?: string } }>
  photos?: Array<{ link?: string }>
  location?: { city?: { name?: string } }
}

interface OlxResponse {
  data?: OlxOffer[]
}

function extractPrice(offer: OlxOffer): number | null {
  const priceParam = offer.params?.find((p) => p.key === 'price' || p.type === 'price')
  const value = priceParam?.value?.value
  return typeof value === 'number' && value > 0 ? value : null
}

export async function searchOlxSource(source: BuySource, query: string, limit = 30): Promise<RawListing[]> {
  const url = new URL(`https://www.${source.domain}/api/v1/offers/`)
  url.searchParams.set('query', query)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', '0')

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`${source.name} falhou (${response.status})`)
  }

  const payload = (await response.json()) as OlxResponse
  const listings: RawListing[] = []

  for (const offer of payload.data ?? []) {
    const price = extractPrice(offer)
    if (price === null) continue

    const title = offer.title?.trim() ?? 'Sem título'
    const description = offer.description?.replace(/<[^>]+>/g, ' ').trim() ?? ''
    const bundle = detectBundle(title, description)

    listings.push({
      id: `${source.id}-${offer.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: 'olx',
      region: source.region,
      title,
      description,
      price,
      priceEur: toEur(price, source.currency),
      currency: source.currency,
      url: offer.url,
      imageUrl: offer.photos?.[0]?.link,
      location: offer.location?.city?.name,
      isBundle: bundle.isBundle,
      bundleScore: bundle.score,
    })
  }

  return listings
}

import { detectBundle } from '../bundle'
import type { RawListing, VintedPriceStats } from '../types'
import type { BuySource } from './config'
import { toEur } from './config'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

interface VintedItem {
  id: number
  title: string
  price?: string | number | { amount?: string | number }
  total_item_price?: string | number | { amount?: string | number }
  url?: string
  photo?: { url?: string }
  user?: { city?: string }
}

interface VintedResponse {
  items?: VintedItem[]
}

function parsePrice(value: string | number | { amount?: string | number } | undefined): number | null {
  if (typeof value === 'number' && value > 0) return value
  if (typeof value === 'object' && value !== null && 'amount' in value) {
    return parsePrice(value.amount)
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

async function bootstrapVintedSession(domain: string): Promise<string> {
  const response = await fetch(`https://www.${domain}/catalog`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  })

  const cookieMap = new Map<string, string>()
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';')
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    cookieMap.set(pair.slice(0, separator), pair.slice(separator + 1))
  }

  const cookieHeader = [...cookieMap.entries()]
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

  if (!cookieHeader.includes('access_token_web=')) {
    throw new Error(`Não foi possível iniciar sessão ${domain}`)
  }

  return cookieHeader
}

async function fetchVintedItems(domain: string, query: string, perPage: number): Promise<VintedItem[]> {
  const cookie = await bootstrapVintedSession(domain)
  const url = new URL(`https://www.${domain}/api/v2/catalog/items`)
  url.searchParams.set('search_text', query)
  url.searchParams.set('page', '1')
  url.searchParams.set('per_page', String(perPage))
  url.searchParams.set('order', 'relevance')

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Cookie: cookie,
    },
  })

  if (!response.ok) {
    throw new Error(`Vinted ${domain} falhou (${response.status})`)
  }

  const payload = (await response.json()) as VintedResponse
  return payload.items ?? []
}

export async function searchVintedSource(
  source: BuySource,
  query: string,
  limit = 24,
): Promise<RawListing[]> {
  const items = await fetchVintedItems(source.domain, query, limit)
  const listings: RawListing[] = []

  for (const item of items) {
    const price = parsePrice(item.total_item_price ?? item.price)
    if (price === null) continue

    const bundle = detectBundle(item.title, '')

    listings.push({
      id: `${source.id}-${item.id}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: 'vinted',
      region: source.region,
      title: item.title,
      description: '',
      price,
      priceEur: toEur(price, source.currency),
      currency: source.currency,
      url: item.url ?? `https://www.${source.domain}/items/${item.id}`,
      imageUrl: item.photo?.url,
      location: item.user?.city,
      isBundle: bundle.isBundle,
      bundleScore: bundle.score,
    })
  }

  return listings
}

export async function searchVintedPtPrices(query: string, perPage = 24): Promise<VintedPriceStats> {
  const items = await fetchVintedItems('vinted.pt', query, perPage)
  const prices = items
    .map((item) => parsePrice(item.total_item_price ?? item.price))
    .filter((p): p is number => p !== null)

  if (prices.length === 0) {
    return { median: 0, average: 0, min: 0, max: 0, sampleSize: 0 }
  }

  const sum = prices.reduce((acc, p) => acc + p, 0)
  return {
    median: median(prices),
    average: sum / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    sampleSize: prices.length,
  }
}

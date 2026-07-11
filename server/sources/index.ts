import type { BuySource } from './config'
import { BUY_SOURCES } from './config'
import { searchOlxSource } from './olx'
import { searchVintedSource } from './vinted'
import type { RawListing } from '../types'

export async function searchBuySources(
  query: string,
  sourceIds: string[],
  limitPerSource = 20,
): Promise<{ listings: RawListing[]; errors: string[] }> {
  const enabled = sourceIds.length
    ? BUY_SOURCES.filter((s) => sourceIds.includes(s.id))
    : BUY_SOURCES

  const results = await Promise.all(
    enabled.map(async (source) => {
      try {
        const listings = await searchSource(source, query, limitPerSource)
        return { listings, error: null as string | null }
      } catch (error) {
        return {
          listings: [] as RawListing[],
          error: error instanceof Error ? error.message : `${source.name} falhou`,
        }
      }
    }),
  )

  const listings: RawListing[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  for (const result of results) {
    if (result.error) errors.push(result.error)
    for (const listing of result.listings) {
      if (seen.has(listing.id)) continue
      seen.add(listing.id)
      listings.push(listing)
    }
  }

  return { listings, errors }
}

async function searchSource(source: BuySource, query: string, limit: number): Promise<RawListing[]> {
  if (source.type === 'olx') return searchOlxSource(source, query, limit)
  if (source.type === 'vinted') return searchVintedSource(source, query, limit)
  return []
}

export { BUY_SOURCES }

export type SourceRegion = 'EU' | 'nonEU'
export type SourceType = 'olx' | 'vinted' | 'ebay' | 'wallapop' | 'web'

export interface RawListing {
  id: string
  sourceId: string
  sourceName: string
  sourceType: SourceType
  region: SourceRegion
  title: string
  description: string
  price: number
  priceEur: number
  currency: string
  url: string
  imageUrl?: string
  location?: string
  isBundle: boolean
  bundleScore: number
}

export interface VintedPriceStats {
  median: number
  average: number
  min: number
  max: number
  sampleSize: number
}

export interface Opportunity {
  id: string
  buyListing: RawListing
  vintedStats: VintedPriceStats
  estimatedSellPrice: number
  buyPrice: number
  buyPriceEur: number
  packagingCost: number
  estimatedProfit: number
  profitMarginPct: number
  confidence: 'high' | 'medium' | 'low'
  searchQuery: string
  notes: string[]
}

export interface SearchRequest {
  query: string
  sourceIds?: string[]
  bundlesOnly?: boolean
  minProfitPct?: number
  maxBuyPrice?: number
  packagingCost?: number
  limit?: number
}

export interface SearchResponse {
  query: string
  searchedAt: string
  opportunities: Opportunity[]
  scannedBuyListings: number
  sourcesSearched: string[]
  errors: string[]
}

export interface HuntBrief {
  what: string
  category: string
  sources: string[]
  region: 'EU' | 'nonEU' | 'any'
  maxBuy: string
  lotsOnly: boolean
}

export interface HuntSettings {
  vatPct: number
  applyDuty: boolean
  dutyPct: number
  dutyThreshold: number
  vintedShip: number
  sellThrough: number
  capital: number
  fx: Record<string, number>
  scoreFlip: number
  scoreThin: number
  huntTarget: number
}

export interface HuntCandidate {
  id: string
  name: string
  category: string
  size: string
  condition: string
  region: 'EU' | 'nonEU'
  currency: string
  buyPrice: number | string
  sourceShip: number | string
  qty: number
  resaleOverride: string
  ai: {
    low: number
    mid: number
    high: number
    demand: 'hot' | 'steady' | 'slow'
    confidence: 'high' | 'medium' | 'low'
    note: string
  } | null
  sourceUrl: string
  sourceName: string
  _hunted?: boolean
  _exactLink?: boolean
  _verified?: boolean
}

export interface HuntResponse {
  items: HuntCandidate[]
  allFailed: boolean
  anyFailed: boolean
  batchCount: number
  hint?: string
  scannedBuyListings?: number
  searchErrors?: string[]
}

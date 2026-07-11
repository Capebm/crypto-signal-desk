import type { HuntCandidate } from '../../../server/types'

export function validUrl(u: string) {
  if (!u || typeof u !== 'string') return false
  try {
    const url = new URL(u.trim())
    if (!/^https?:$/.test(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    if (host.length < 4 || host === 'example.com') return false
    const good = ['ebay.', 'vinted.', 'aliexpress.', 'vestiairecollective.', 'depop.', 'grailed.', 'olx.', 'wallapop.']
    return good.some((h) => host.includes(h)) || url.pathname.length > 1
  } catch {
    return false
  }
}

export function buildSourceSearch(sourceName = '', query = '') {
  const s = sourceName.toLowerCase()
  const q = encodeURIComponent(query.trim())
  if (s.includes('ebay') && s.includes('de')) return `https://www.ebay.de/sch/i.html?_nkw=${q}`
  if (s.includes('ebay')) return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}`
  if (s.includes('vinted') && s.includes('es')) return `https://www.vinted.es/catalog?search_text=${q}`
  if (s.includes('vinted') && s.includes('fr')) return `https://www.vinted.fr/catalog?search_text=${q}`
  if (s.includes('vinted') && s.includes('de')) return `https://www.vinted.de/catalog?search_text=${q}`
  if (s.includes('vinted') && s.includes('uk')) return `https://www.vinted.co.uk/catalog?search_text=${q}`
  if (s.includes('wallapop')) return `https://es.wallapop.com/app/search?keyword=${q}`
  if (s.includes('olx') && s.includes('pl')) return `https://www.olx.pl/oferty/q/${q}/`
  if (s.includes('olx')) return `https://www.olx.pt/ads/q/${q}/`
  return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}`
}

export function sourceLinks(query: string) {
  const q = encodeURIComponent(query || '')
  return [
    { label: 'eBay UK', url: `https://www.ebay.co.uk/sch/i.html?_nkw=${q}` },
    { label: 'eBay DE', url: `https://www.ebay.de/sch/i.html?_nkw=${q}` },
    { label: 'Vinted FR', url: `https://www.vinted.fr/catalog?search_text=${q}` },
    { label: 'Vinted ES', url: `https://www.vinted.es/catalog?search_text=${q}` },
    { label: 'Wallapop', url: `https://es.wallapop.com/app/search?keyword=${q}` },
    { label: 'Vinted PT · comps', url: `https://www.vinted.pt/catalog?search_text=${q}`, comp: true },
  ]
}

export function opportunityToCandidate(opp: {
  id: string
  buyListing: {
    title: string
    url: string
    sourceName: string
    region: 'EU' | 'nonEU'
    currency: string
    priceEur: number
    isBundle: boolean
  }
  estimatedSellPrice: number
  vintedStats: { min: number; max: number }
  confidence: 'high' | 'medium' | 'low'
}): HuntCandidate {
  return {
    id: opp.id,
    name: opp.buyListing.title,
    category: opp.buyListing.isBundle ? 'Lote/Bundle' : 'Outro',
    size: '',
    condition: 'good',
    region: opp.buyListing.region,
    currency: 'EUR',
    buyPrice: opp.buyListing.priceEur,
    sourceShip: '',
    qty: opp.buyListing.isBundle ? 5 : 1,
    resaleOverride: '',
    ai: {
      low: opp.vintedStats.min,
      mid: opp.estimatedSellPrice,
      high: opp.vintedStats.max,
      demand: 'steady',
      confidence: opp.confidence,
      note: 'comparáveis Vinted PT',
    },
    sourceUrl: opp.buyListing.url,
    sourceName: opp.buyListing.sourceName,
    _exactLink: true,
  }
}

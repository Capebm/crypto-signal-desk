export type SourceRegion = 'EU' | 'nonEU'
export type SourceType = 'olx' | 'vinted' | 'ebay' | 'wallapop' | 'web'

export interface BuySource {
  id: string
  name: string
  type: SourceType
  region: SourceRegion
  currency: 'EUR' | 'GBP' | 'USD' | 'PLN'
  domain: string
  country: string
}

export const BUY_SOURCES: BuySource[] = [
  { id: 'olx-pt', name: 'OLX Portugal', type: 'olx', region: 'EU', currency: 'EUR', domain: 'olx.pt', country: 'PT' },
  { id: 'olx-pl', name: 'OLX Polónia', type: 'olx', region: 'EU', currency: 'PLN', domain: 'olx.pl', country: 'PL' },
  { id: 'olx-ro', name: 'OLX Roménia', type: 'olx', region: 'EU', currency: 'EUR', domain: 'olx.ro', country: 'RO' },
  { id: 'vinted-es', name: 'Vinted Espanha', type: 'vinted', region: 'EU', currency: 'EUR', domain: 'vinted.es', country: 'ES' },
  { id: 'vinted-fr', name: 'Vinted França', type: 'vinted', region: 'EU', currency: 'EUR', domain: 'vinted.fr', country: 'FR' },
  { id: 'vinted-de', name: 'Vinted Alemanha', type: 'vinted', region: 'EU', currency: 'EUR', domain: 'vinted.de', country: 'DE' },
  { id: 'vinted-uk', name: 'Vinted UK', type: 'vinted', region: 'EU', currency: 'GBP', domain: 'vinted.co.uk', country: 'UK' },
  { id: 'vinted-pl', name: 'Vinted Polónia', type: 'vinted', region: 'EU', currency: 'PLN', domain: 'vinted.pl', country: 'PL' },
  { id: 'vinted-it', name: 'Vinted Itália', type: 'vinted', region: 'EU', currency: 'EUR', domain: 'vinted.it', country: 'IT' },
]

export const HUNT_SOURCE_LABELS = [
  'Vinted ES',
  'Wallapop',
  'eBay UK',
  'eBay DE',
  'Vinted DE',
  'Vinted FR',
  'Vinted UK',
  'Lotes/atacado',
  'Grailed/Depop',
  'Vestiaire Collective',
  'AliExpress',
  'OLX PT',
  'OLX PL',
  'Qualquer',
] as const

export const DEFAULT_FX: Record<string, number> = {
  EUR: 1,
  GBP: 1.17,
  USD: 0.92,
  PLN: 0.23,
}

export function toEur(amount: number, currency: string, fx = DEFAULT_FX): number {
  const rate = fx[currency] ?? 1
  return amount * rate
}

export function buildSourceSearch(sourceName = '', query = ''): string {
  const s = sourceName.toLowerCase()
  const q = encodeURIComponent(query.trim())
  if (s.includes('ebay') && s.includes('de')) return `https://www.ebay.de/sch/i.html?_nkw=${q}`
  if (s.includes('ebay') && s.includes('es')) return `https://www.ebay.es/sch/i.html?_nkw=${q}`
  if (s.includes('ebay')) return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}`
  if (s.includes('vinted') && s.includes('es')) return `https://www.vinted.es/catalog?search_text=${q}`
  if (s.includes('vinted') && s.includes('de')) return `https://www.vinted.de/catalog?search_text=${q}`
  if (s.includes('vinted') && s.includes('fr')) return `https://www.vinted.fr/catalog?search_text=${q}`
  if (s.includes('vinted') && s.includes('uk')) return `https://www.vinted.co.uk/catalog?search_text=${q}`
  if (s.includes('vinted') && s.includes('pl')) return `https://www.vinted.pl/catalog?search_text=${q}`
  if (s.includes('vinted')) return `https://www.vinted.es/catalog?search_text=${q}`
  if (s.includes('wallapop')) return `https://es.wallapop.com/app/search?keyword=${q}`
  if (s.includes('vestiaire')) return `https://www.vestiairecollective.com/search/?q=${q}`
  if (s.includes('ali')) return `https://www.aliexpress.com/wholesale?SearchText=${q}`
  if (s.includes('olx') && s.includes('pl')) return `https://www.olx.pl/oferty/q/${q}/`
  if (s.includes('olx')) return `https://www.olx.pt/ads/q/${q}/`
  if (s.includes('lote') || s.includes('atacado') || s.includes('job') || s.includes('wholesale')) {
    return `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(`${query} job lot bundle`)}`
  }
  if (s.includes('depop')) return `https://www.depop.com/search/?q=${q}`
  if (s.includes('grailed')) return `https://www.grailed.com/shop?query=${q}`
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

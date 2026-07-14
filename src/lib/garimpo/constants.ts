import type { HuntSettings } from '../../../server/types'

export const CATEGORIES = [
  'Sapatilhas',
  'Ténis/Sneakers',
  'Casaco',
  'Camisola',
  'T-shirt',
  'Calças/Denim',
  'Vestido',
  'Mala/Bolsa',
  'Acessório',
  'Streetwear',
  'Criança',
  'Lote/Bundle',
  'Outro',
]

export const HUNT_CATEGORIES = ['Tudo', ...CATEGORIES.filter((c) => c !== 'Lote/Bundle')]

export const CONDITIONS = [
  { id: 'nwt', label: 'Novo c/ etiqueta' },
  { id: 'nwot', label: 'Novo s/ etiqueta' },
  { id: 'vgood', label: 'Muito bom' },
  { id: 'good', label: 'Bom' },
  { id: 'fair', label: 'Satisfatório' },
]

export const DEFAULT_SETTINGS: HuntSettings = {
  vatPct: 23,
  applyDuty: false,
  dutyPct: 12,
  dutyThreshold: 150,
  vintedShip: 4,
  sellThrough: 100,
  capital: 500,
  fx: { EUR: 1, GBP: 1.17, USD: 0.92, PLN: 0.23 },
  scoreFlip: 68,
  scoreThin: 42,
  huntTarget: 20,
}

export const SOURCES = [
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
]

/** Hunt chip labels that map to real scraper APIs (no Anthropic cost). */
export const SCRAPER_SOURCE_MAP: Record<string, string> = {
  'Vinted ES': 'vinted-es',
  'Vinted DE': 'vinted-de',
  'Vinted FR': 'vinted-fr',
  'Vinted UK': 'vinted-uk',
  'OLX PT': 'olx-pt',
  'OLX PL': 'olx-pl',
}

export const ALL_SCRAPER_IDS = [
  'olx-pt',
  'olx-pl',
  'vinted-es',
  'vinted-fr',
  'vinted-de',
  'vinted-uk',
  'vinted-pl',
  'vinted-it',
]

export function briefToScraperIds(sources: string[]): string[] {
  if (!sources.length || sources.includes('Qualquer')) return ALL_SCRAPER_IDS
  const ids = sources.map((s) => SCRAPER_SOURCE_MAP[s]).filter(Boolean)
  return ids.length ? [...new Set(ids)] : ALL_SCRAPER_IDS
}

export function unsupportedHuntSources(sources: string[]): string[] {
  return sources.filter((s) => s !== 'Qualquer' && !SCRAPER_SOURCE_MAP[s])
}

export const money = (n: number) => `${n < 0 ? '-€' : '€'}${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`
export const pct = (n: number) => `${Math.round(n)}%`

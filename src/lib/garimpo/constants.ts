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

export const money = (n: number) => `${n < 0 ? '-€' : '€'}${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`
export const pct = (n: number) => `${Math.round(n)}%`

import { T212_CATALOG } from '../yahoo-market'
import type { AssetClass, TradeVenue } from './types'

const KIND_TO_CLASS: Record<string, AssetClass> = {
  index: 'index',
  future: 'index',
  forex: 'forex',
  metal: 'commodity',
  energy: 'commodity',
  crypto: 'crypto',
  stock: 'stock',
}

/** Símbolos T212 que não estão no catálogo do Desk mas aparecem nos CSVs. */
const EXTRA_CLASS: Record<string, AssetClass> = {
  USDOLLAR: 'index', UK100: 'index', FR40: 'index', ITA40: 'index', SPAIN35: 'index', JPN225: 'index', GER40: 'index',
  XAGUSD: 'commodity', XAUUSD: 'commodity', NATGAS: 'commodity', BRENT: 'commodity', OIL: 'commodity', COPPER: 'commodity',
  BTC: 'crypto', ETH: 'crypto', SOL: 'crypto', XRP: 'crypto', AVAX: 'crypto', LINK: 'crypto', DOT: 'crypto', ETC: 'crypto',
  LTC: 'crypto', ADA: 'crypto', DOGE: 'crypto',
}

const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'HUF', 'CZK', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNH'])

const catalogClass = new Map<string, AssetClass>()
for (const item of T212_CATALOG) {
  const cls = KIND_TO_CLASS[item.kind]
  if (!cls) continue
  catalogClass.set(item.short.toUpperCase(), cls)
  catalogClass.set(item.t212Search.toUpperCase(), cls)
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  crypto: 'Crypto',
  stock: 'Ações',
  index: 'Índices',
  forex: 'Forex',
  commodity: 'Matérias-primas',
}

/** Spot Binance é sempre crypto; T212 usa o catálogo e depois heurística por ticker. */
export function classifyAssetClass(symbol: string, venue: TradeVenue): AssetClass {
  if (venue === 'spot') return 'crypto'
  const key = symbol.toUpperCase()
  const known = EXTRA_CLASS[key] ?? catalogClass.get(key)
  if (known) return known
  if (key.length === 6 && CURRENCIES.has(key.slice(0, 3)) && CURRENCIES.has(key.slice(3))) return 'forex'
  return 'stock'
}

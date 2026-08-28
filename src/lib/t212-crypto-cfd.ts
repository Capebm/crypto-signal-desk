/**
 * Crypto CFDs que a T212 realmente lista (conta Markets Ltd / EU GmbH).
 * O catálogo interno misturava pares Binance; SHORT JÁ nesses nomes não é executável.
 *
 * Fonte: páginas oficiais /trading-instruments/cfd/{TICKER} com categoria Cryptocurrencies.
 * POL na T212 continua MATIC (não POL). ATOM/JUP colidem com acções — ficam de fora.
 */
export const T212_CRYPTO_CFD_TICKER: Record<string, string> = {
  btc: 'BTC',
  eth: 'ETH',
  sol: 'SOL',
  xrp: 'XRP',
  doge: 'DOGE',
  ada: 'ADA',
  link: 'LINK',
  avax: 'AVAX',
  ltc: 'LTC',
  bnb: 'BNB',
  dot: 'DOT',
  xlm: 'XLM',
  trx: 'TRX',
  shib: 'SHIB',
  uni: 'UNI',
  aave: 'AAVE',
  algo: 'ALGO',
  pol: 'MATIC',
  etc: 'ETC',
  bch: 'BCH',
}

export function t212IsCfdListed(item: { id: string; kind: string }): boolean {
  if (item.kind !== 'crypto') return true
  return item.id in T212_CRYPTO_CFD_TICKER
}

/** Ticker a pesquisar na app T212 (CFD → Crypto). */
export function t212ExecuteTicker(item: { id: string; kind: string; short: string }): string {
  if (item.kind !== 'crypto') return item.short
  return T212_CRYPTO_CFD_TICKER[item.id] ?? item.short
}

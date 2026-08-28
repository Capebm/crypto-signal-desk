/**
 * Cryptos que existem como CFD na T212 (execução Buy/Sell). O feed é Binance Spot
 * porque a T212 não tem API de preços — não é um modo «só análise».
 * POL na T212 continua MATIC. ATOM/JUP colidem com acções e ficam de fora.
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

/**
 * Nome a pesquisar na T212 quando o ticker Binance é outro (mesma moeda).
 * Feed = API Binance; execução = Buy/Sell manual na T212.
 */
export const T212_CRYPTO_CFD_TICKER: Record<string, string> = {
  pol: 'MATIC',
  rndr: 'RENDER',
  atom: 'Cosmos',
  jup: 'Jupiter',
}

export function t212IsCfdListed(_item: { id: string; kind: string }): boolean {
  return true
}

/** Ticker a pesquisar na app T212 (CFD → Crypto). */
export function t212ExecuteTicker(item: { id: string; kind: string; short: string }): string {
  if (item.kind !== 'crypto') return item.short
  return T212_CRYPTO_CFD_TICKER[item.id] ?? item.short
}

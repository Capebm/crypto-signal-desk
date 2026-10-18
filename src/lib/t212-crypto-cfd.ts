/**
 * Ticker exacto a escrever na pesquisa CFD da app T212.
 * Fonte: páginas /trading-instruments/cfd/… (não Yahoo, não inventar).
 *
 * Índices verificados: TECH100, USA500, USA30, GER40, UK100, FR40, EU50,
 * JPN225, SPAIN35, ITA40, HK50, NL25, SWISS20, VOLX.
 * Commodities verificadas: CRUDE, NATGAS, COPPER, BRENT, PALLADIUM.
 * Metais forex: XAUUSD / XAGUSD (docs T212: Gold (XAUUSD); página XAGUSD).
 *   GOLD/SILVER na pesquisa = acções (Gold.com, mineiras) — não o metal.
 * Crypto CFD verificadas contra o catálogo CFD da T212 (categoria Cryptocurrencies):
 * são exactamente 22 e estão todas aqui. POL na T212 = MATIC.
 * Fora: XRP, BNB, SHIB, TRX, XLM e AAVE não são CFD na T212 (0 de 9302
 *   instrumentos, nem por nome: Ripple / Binance / Shiba / Stellar / Aave).
 *   Pesquisá-las devolve acções — SHIB dá Zhejiang Shibao e Toshiba TEC,
 *   TRX dá Lantronix e Matrix Service. Mesma armadilha do ATOM/JUP.
 * ATOM/JUP ficam de fora: na pesquisa T212 são acções (Atomera / fundo LSE),
 * não o crypto CFD — o utilizador confirmou "No crypto found" para Jupiter.
 *
 * Removidos por página inexistente (classe SWE30): SWE30, DXY, AUS200, US2000.
 */
export const T212_APP_TICKER: Record<string, string> = {
  tech100: 'TECH100',
  us500: 'USA500',
  us30: 'USA30',
  ger40: 'GER40',
  uk100: 'UK100',
  fra40: 'FR40',
  eu50: 'EU50',
  jp225: 'JPN225',
  spa35: 'SPAIN35',
  ita40: 'ITA40',
  hk50: 'HK50',
  swiss20: 'SWISS20',
  neth25: 'NL25',
  volx: 'VOLX',
  es: 'USA500',
  nq: 'TECH100',
  ym: 'USA30',
  ngas: 'NATGAS',
  oil: 'CRUDE',
  brent: 'BRENT',
  xauusd: 'XAUUSD',
  xagusd: 'XAGUSD',
  platinum: 'XPTUSD',
  palladium: 'PALLADIUM',
  copper: 'COPPER',
  pol: 'MATIC',
}

/** Crypto CFDs com página T212 /trading-instruments/cfd/{TICKER}. */
export const T212_CRYPTO_CFD_TICKER: Record<string, string> = {
  btc: 'BTC',
  eth: 'ETH',
  sol: 'SOL',
  doge: 'DOGE',
  ada: 'ADA',
  link: 'LINK',
  avax: 'AVAX',
  ltc: 'LTC',
  dot: 'DOT',
  uni: 'UNI',
  algo: 'ALGO',
  bat: 'BAT',
  enj: 'ENJ',
  pol: 'MATIC',
  etc: 'ETC',
  bch: 'BCH',
  // Confirmados no site T212 em 2026-10-01.
  crv: 'CRV',
  eos: 'EOS',
  fil: 'FIL',
  mana: 'MANA',
  sand: 'SAND',
  zec: 'ZEC',
}

export function t212IsCfdListed(item: { id: string; kind: string }): boolean {
  if (item.kind !== 'crypto') return true
  return item.id in T212_CRYPTO_CFD_TICKER
}

/** Ticker a pesquisar na app T212 (conta CFD). Nunca strings compostas. */
export function t212ExecuteTicker(item: { id: string; t212Search: string; short?: string }): string {
  return T212_APP_TICKER[item.id] ?? T212_CRYPTO_CFD_TICKER[item.id] ?? item.t212Search
}

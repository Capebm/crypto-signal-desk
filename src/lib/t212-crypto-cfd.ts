/**
 * Ticker exacto a escrever na pesquisa CFD da app T212.
 * Fonte: páginas /trading-instruments/cfd/… (não Yahoo, não inventar).
 *
 * Índices verificados: TECH100, US500, US30, GER40, UK100, FR40, EU50,
 * JPN225, SPAIN35, ITA40, HK50, NL25, SWISS20, VOLX.
 * Commodities verificadas: CRUDE, NATGAS, COPPER, BRENT, PALLADIUM.
 * Metais forex: XAUUSD / XAGUSD (docs T212: Gold (XAUUSD); página XAGUSD).
 *   GOLD/SILVER na pesquisa = acções (Gold.com, mineiras) — não o metal.
 * Crypto com nome ≠ ticker: MATIC (não POL), Cosmos (ATOM = Atomera),
 * Jupiter (JUP = fundo LSE), RENDER.
 *
 * Removidos por página inexistente (classe SWE30): SWE30, DXY, AUS200, US2000.
 */
export const T212_APP_TICKER: Record<string, string> = {
  tech100: 'TECH100',
  us500: 'US500',
  us30: 'US30',
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
  es: 'US500',
  nq: 'TECH100',
  ym: 'US30',
  ngas: 'NATGAS',
  oil: 'CRUDE',
  brent: 'BRENT',
  xauusd: 'XAUUSD',
  xagusd: 'XAGUSD',
  platinum: 'XPTUSD',
  palladium: 'PALLADIUM',
  copper: 'COPPER',
  pol: 'MATIC',
  rndr: 'RENDER',
  atom: 'Cosmos',
  jup: 'Jupiter',
}

/** @deprecated use T212_APP_TICKER */
export const T212_CRYPTO_CFD_TICKER: Record<string, string> = { pol: 'MATIC' }

export function t212IsCfdListed(_item: { id: string; kind: string }): boolean {
  return true
}

/** Ticker a pesquisar na app T212 (conta CFD). Nunca strings compostas. */
export function t212ExecuteTicker(item: { id: string; t212Search: string; short?: string }): string {
  return T212_APP_TICKER[item.id] ?? item.t212Search
}

/**
 * Bolsa de cada índice: a abertura à vista é onde o TJR opera (NY open para ES/NQ).
 * A janela de entrada de cada índice começa na abertura da sua bolsa, em hora local
 * (segue sozinha as mudanças de hora de cada país).
 */
export type ExchangeSession = { label: string; timeZone: string; openMinutes: number; closeMinutes: number }

export const NY_SESSION: ExchangeSession = { label: 'Nova Iorque', timeZone: 'America/New_York', openMinutes: 9 * 60 + 30, closeMinutes: 16 * 60 }
const FRANKFURT: ExchangeSession = { label: 'Frankfurt', timeZone: 'Europe/Berlin', openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 }
const LONDON: ExchangeSession = { label: 'Londres', timeZone: 'Europe/London', openMinutes: 8 * 60, closeMinutes: 16 * 60 + 30 }
const PARIS: ExchangeSession = { label: 'Paris', timeZone: 'Europe/Paris', openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 }
const MADRID: ExchangeSession = { label: 'Madrid', timeZone: 'Europe/Madrid', openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 }
const MILAN: ExchangeSession = { label: 'Milão', timeZone: 'Europe/Rome', openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 }
const ZURICH: ExchangeSession = { label: 'Zurique', timeZone: 'Europe/Zurich', openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 }
const AMSTERDAM: ExchangeSession = { label: 'Amesterdão', timeZone: 'Europe/Amsterdam', openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 }
const TOKYO: ExchangeSession = { label: 'Tóquio', timeZone: 'Asia/Tokyo', openMinutes: 9 * 60, closeMinutes: 15 * 60 + 30 }
const HONG_KONG: ExchangeSession = { label: 'Hong Kong', timeZone: 'Asia/Hong_Kong', openMinutes: 9 * 60 + 30, closeMinutes: 16 * 60 }

/** Por ticker T212 (scan) e pelos nomes que aparecem nos extratos da T212 (diário). */
const BY_SYMBOL: Record<string, ExchangeSession> = {
  US500: NY_SESSION,
  TECH100: NY_SESSION,
  US30: NY_SESSION,
  ES: NY_SESSION,
  NQ: NY_SESSION,
  YM: NY_SESSION,
  GER40: FRANKFURT,
  EU50: FRANKFURT,
  UK100: LONDON,
  FRA40: PARIS,
  FR40: PARIS,
  SPA35: MADRID,
  SPAIN35: MADRID,
  ITA40: MILAN,
  SWISS20: ZURICH,
  NETH25: AMSTERDAM,
  NL25: AMSTERDAM,
  JP225: TOKYO,
  JPN225: TOKYO,
  HK50: HONG_KONG,
}

/** Índices do foco «Só índices» (ids do catálogo; VOLX fica de fora — é volatilidade, não um índice de bolsa). */
export const INDEX_FOCUS_IDS = ['us500', 'tech100', 'us30', 'ger40', 'uk100', 'fra40', 'eu50', 'spa35', 'ita40', 'swiss20', 'neth25', 'jp225', 'hk50']

/** Sem bolsa conhecida (crypto, forex, ações US, …) → abertura de Nova Iorque. */
export function exchangeFor(symbol?: string): ExchangeSession {
  return (symbol && BY_SYMBOL[symbol.toUpperCase()]) || NY_SESSION
}

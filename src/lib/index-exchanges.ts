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
  USA500: NY_SESSION,
  TECH100: NY_SESSION,
  US30: NY_SESSION,
  USA30: NY_SESSION,
  USA2000: NY_SESSION,
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

/**
 * Foco TJR: só o que o Desk consegue mesmo levar a JÁ, por ordem de aderência ao método.
 *  - Índices US: escala de futuros da T212 + cauda ao vivo + SMT ES↔NQ a sério.
 *  - Majors de forex: sessões reais (Londres/NY), liquidez profunda, feed Yahoo FX ao vivo.
 *  - Ouro e prata: spot da Capital.com, alinhado com a T212 e ao minuto.
 *  - BTC/ETH: Binance ao vivo.
 * Fora: commodities, obrigações e agrícolas — o Yahoo entrega-as com 10-12 min
 * e a barra de 3 min do requireLiveConfirmationForStaleLtf nunca as deixa chegar a JÁ.
 */
export const TJR_FOCUS_IDS = [
  'us500', 'tech100', 'us30', 'usa2000',
  'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'usdcad', 'nzdusd', 'eurjpy', 'gbpjpy', 'eurgbp',
  'xauusd', 'xagusd',
  'btc', 'eth',
]

/** @deprecated Mantido para compatibilidade; usa TJR_FOCUS_IDS. */
export const INDEX_FOCUS_IDS = TJR_FOCUS_IDS

/** Pares com EUR, GBP ou CHF fazem o seu volume na sessão de Londres; o resto segue NY. */
const LONDON_CURRENCIES = /EUR|GBP|CHF/

/** Sem bolsa conhecida (crypto, ações US, …) → abertura de Nova Iorque. */
export function exchangeFor(symbol?: string, kind?: string): ExchangeSession {
  if (!symbol) return NY_SESSION
  const upper = symbol.toUpperCase()
  const known = BY_SYMBOL[upper]
  if (known) return known
  if (kind === 'forex' && LONDON_CURRENCIES.test(upper.replace('/', ''))) return LONDON
  return NY_SESSION
}

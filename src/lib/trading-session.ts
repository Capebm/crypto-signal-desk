export type SessionWindow = 'ny_open' | 'ny' | 'ny_close' | 'london' | 'quiet' | 'off'

export type MarketId = 'asia' | 'london' | 'newyork'

export type MarketClock = {
  id: MarketId
  label: string
  city: string
  time: string
  tzShort: string
  active: boolean
  ideal: boolean
  status: string
  windowEt: string
  windowLisbon: string
}

export type MarketClocksSnapshot = {
  clocks: MarketClock[]
  local: { label: string; time: string }
  /** Janelas killzone em ET e Lisboa (horário local do utilizador). */
  windows: {
    nyOpen: { et: string; lisbon: string }
    nyMid: { et: string; lisbon: string }
    nyClose: { et: string; lisbon: string }
    london: { et: string; lisbon: string }
    asia: { et: string; lisbon: string }
  }
}

export type TradingSessionStatus = {
  window: SessionWindow
  inIdealWindow: boolean
  /** COMPRAR JÁ permitido (open NY). */
  allowEnterNow: boolean
  /** Novas entradas bloqueadas (fecho / quiet / off). */
  blockEntries: boolean
  badge: string
  nowLisbon: string
  nowNy: string
}

export type SessionMarket = 'cfd' | 'crypto'

export type SessionOptions = {
  /** CFD: fecha fim de semana. Crypto Spot: 24/7 — só killzones TJR. Default: cfd. */
  market?: SessionMarket
}

const zoneParts = (timeZone: string, date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return {
    hour,
    minute,
    mins: hour * 60 + minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

/** Minutos desde meia-noite em America/New_York. */
export function getNyMinutes(date = new Date()): number {
  return zoneParts('America/New_York', date).mins
}

/** Janela TJR índices US: 09:30–10:30 ET (RTH prime + cutoff). */
export const US_INDEX_PRIME_START_MINS = 9 * 60 + 30
export const US_INDEX_PRIME_END_MINS = 10 * 60 + 30

export function usIndexPrimeWindow(date = new Date()): {
  beforeOpen: boolean
  inPrime: boolean
  afterCutoff: boolean
  nyMins: number
} {
  const nyMins = getNyMinutes(date)
  return {
    nyMins,
    beforeOpen: nyMins < US_INDEX_PRIME_START_MINS,
    inPrime: nyMins >= US_INDEX_PRIME_START_MINS && nyMins < US_INDEX_PRIME_END_MINS,
    afterCutoff: nyMins >= US_INDEX_PRIME_END_MINS,
  }
}

/**
 * Killzones estilo TJR (futures US), em America/New_York:
 * - 09:30–11:00 open → COMPRAR JÁ
 * - 11:00–15:00 mid → só AGUARDAR (exceto agressivo)
 * - 15:00–16:00 fecho → sem novas entradas
 * - Londres 03:00–08:30 → AGUARDAR
 * - resto / Asia deep → quiet ou off
 */
/** Calendário CFD (índices US + forex major) em America/New_York. */
export function getCfdMarketStatus(date = new Date()): { open: boolean; reason: string } {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date)
  const ny = zoneParts('America/New_York', date)

  if (weekday === 'Sat') {
    return { open: false, reason: 'Sábado — índices e forex fechados. Volta domingo ~17:00 ET (forex) ou segunda 09:30 ET (índices).' }
  }
  if (weekday === 'Sun' && ny.mins < 17 * 60) {
    return { open: false, reason: 'Domingo de manhã — forex ainda fechado (~abre 17:00 ET). Índices só segunda 09:30 ET.' }
  }
  if (weekday === 'Fri' && ny.mins >= 17 * 60) {
    return { open: false, reason: 'Sexta após fecho — mercado encerrado até domingo à noite (forex).' }
  }
  return { open: true, reason: '' }
}

export function getTradingSessionStatus(date = new Date(), options: SessionOptions = {}): TradingSessionStatus {
  const market = options.market ?? 'cfd'
  const ny = zoneParts('America/New_York', date)
  const lisbon = zoneParts('Europe/Lisbon', date)
  const base = { nowLisbon: lisbon.label, nowNy: ny.label }
  if (market === 'cfd') {
    const cfd = getCfdMarketStatus(date)
    if (!cfd.open) {
      return {
        ...base,
        window: 'off',
        inIdealWindow: false,
        allowEnterNow: false,
        blockEntries: true,
        badge: 'Mercado fechado (fim de semana)',
      }
    }
  }

  // NY cash open window (prime TJR)
  if (ny.mins >= 9 * 60 + 30 && ny.mins < 11 * 60) {
    return {
      ...base,
      window: 'ny_open',
      inIdealWindow: true,
      allowEnterNow: true,
      blockEntries: false,
      badge: 'NY open (09:30–11:00 ET)',
    }
  }
  // Mid NY session
  if (ny.mins >= 11 * 60 && ny.mins < 15 * 60) {
    return {
      ...base,
      window: 'ny',
      inIdealWindow: false,
      allowEnterNow: false,
      blockEntries: false,
      badge: 'NY mid — só AGUARDAR',
    }
  }
  // Last hour / close
  if (ny.mins >= 15 * 60 && ny.mins < 16 * 60) {
    return {
      ...base,
      window: 'ny_close',
      inIdealWindow: false,
      allowEnterNow: false,
      blockEntries: true,
      badge: 'NY fecho — sem entradas',
    }
  }
  // London session (NY clock)
  if (ny.mins >= 3 * 60 && ny.mins < 8 * 60 + 30) {
    return {
      ...base,
      window: 'london',
      inIdealWindow: false,
      allowEnterNow: false,
      blockEntries: false,
      badge: 'Sessão Londres',
    }
  }
  // Asia / overnight quiet
  if (ny.mins >= 18 * 60 || ny.mins < 2 * 60) {
    return {
      ...base,
      window: 'quiet',
      inIdealWindow: false,
      allowEnterNow: false,
      blockEntries: true,
      badge: 'Baixa liquidez (Ásia)',
    }
  }
  return {
    ...base,
    window: 'off',
    inIdealWindow: false,
    allowEnterNow: false,
    blockEntries: true,
    badge: 'Fora da killzone',
  }
}

const formatLisbonFromNyMins = (nyMins: number, date = new Date()) => {
  const ny = zoneParts('America/New_York', date)
  const diff = nyMins - ny.mins
  const target = new Date(date.getTime() + diff * 60_000)
  return zoneParts('Europe/Lisbon', target).label
}


/** Relógios dos 3 mercados TJR (Ásia / Londres / NY) + hora local Lisboa. */
export function getMarketClocks(date = new Date()): MarketClocksSnapshot {
  const session = getTradingSessionStatus(date)
  const ny = zoneParts('America/New_York', date)
  const tokyo = zoneParts('Asia/Tokyo', date)
  const london = zoneParts('Europe/London', date)
  const lisbon = zoneParts('Europe/Lisbon', date)

  const asiaActive = ny.mins >= 18 * 60 || ny.mins < 2 * 60
  const londonActive = ny.mins >= 3 * 60 && ny.mins < 8 * 60 + 30
  const nyActive = ny.mins >= 9 * 60 + 30 && ny.mins < 16 * 60

  let nyStatus = 'Fora da sessão'
  if (session.window === 'ny_open') nyStatus = 'OPEN · COMPRAR JÁ'
  else if (session.window === 'ny') nyStatus = 'NY mid — AGUARDAR'
  else if (session.window === 'ny_close') nyStatus = 'Fecho — sem entradas'
  else if (ny.mins >= 8 * 60 + 30 && ny.mins < 9 * 60 + 30) {
    nyStatus = `Abre em ${9 * 60 + 30 - ny.mins} min`
  }

  const asiaStatus = session.window === 'quiet' && asiaActive
    ? 'Baixa liquidez'
    : asiaActive
      ? 'Sessão activa'
      : 'Inactiva'

  const londonStatus = londonActive ? 'Killzone activa' : 'Inactiva'

  return {
    local: { label: 'Lisboa', time: lisbon.label },
    windows: {
      nyOpen: { et: '09:30–11:00', lisbon: `${formatLisbonFromNyMins(9 * 60 + 30, date)}–${formatLisbonFromNyMins(11 * 60, date)}` },
      nyMid: { et: '11:00–15:00', lisbon: `${formatLisbonFromNyMins(11 * 60, date)}–${formatLisbonFromNyMins(15 * 60, date)}` },
      nyClose: { et: '15:00–16:00', lisbon: `${formatLisbonFromNyMins(15 * 60, date)}–${formatLisbonFromNyMins(16 * 60, date)}` },
      london: { et: '03:00–08:30', lisbon: `${formatLisbonFromNyMins(3 * 60, date)}–${formatLisbonFromNyMins(8 * 60 + 30, date)}` },
      asia: { et: '18:00–02:00', lisbon: `${formatLisbonFromNyMins(18 * 60, date)}–${formatLisbonFromNyMins(2 * 60, date)}` },
    },
    clocks: [
      {
        id: 'asia',
        label: 'Ásia',
        city: 'Tóquio',
        time: tokyo.label,
        tzShort: 'JST',
        active: asiaActive,
        ideal: false,
        status: asiaStatus,
        windowEt: '18:00–02:00 ET',
        windowLisbon: `${formatLisbonFromNyMins(18 * 60, date)}–${formatLisbonFromNyMins(2 * 60, date)} PT`,
      },
      {
        id: 'london',
        label: 'Londres',
        city: 'Londres',
        time: london.label,
        tzShort: 'GMT/BST',
        active: londonActive,
        ideal: false,
        status: londonStatus,
        windowEt: '03:00–08:30 ET',
        windowLisbon: `${formatLisbonFromNyMins(3 * 60, date)}–${formatLisbonFromNyMins(8 * 60 + 30, date)} PT`,
      },
      {
        id: 'newyork',
        label: 'Nova Iorque',
        city: 'NY',
        time: ny.label,
        tzShort: 'ET',
        active: nyActive,
        ideal: session.window === 'ny_open',
        status: nyStatus,
        windowEt: '09:30–16:00 ET',
        windowLisbon: `${formatLisbonFromNyMins(9 * 60 + 30, date)}–${formatLisbonFromNyMins(16 * 60, date)} PT`,
      },
    ],
  }
}

/**
 * Instrument-level market status (medium accuracy).
 * - `crypto` => open 24/7
 * - `stock`  => US cash hours (09:30–16:00 ET), closed on weekend
 * - `forex|metal|energy|index|future` => use CFD calendar (weekend closures / Fri after close)
 *
 * This is intentionally conservative and avoids external APIs; good enough for gating scans.
 */
export function getInstrumentMarketStatus(kind: 'index' | 'future' | 'forex' | 'metal' | 'energy' | 'crypto' | 'stock', date = new Date()) {
  const ny = zoneParts('America/New_York', date)

  if (kind === 'crypto') {
    return { open: true, reason: 'Crypto — exchange open 24/7' }
  }

  if (kind === 'stock') {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date)
    if (weekday === 'Sat' || weekday === 'Sun') {
      return { open: false, reason: 'US market closed (weekend)' }
    }
    if (ny.mins >= 9 * 60 + 30 && ny.mins < 16 * 60) {
      return { open: true, reason: 'US stocks open (09:30–16:00 ET)' }
    }
    return { open: false, reason: 'US market closed (pre/post-market)' }
  }

  // For forex, metals, energy, indices and futures rely on CFD calendar rules
  const cfd = getCfdMarketStatus(date)
  return { open: cfd.open, reason: cfd.reason || (cfd.open ? 'Open (CFD calendar)' : 'Closed (CFD calendar)') }
}

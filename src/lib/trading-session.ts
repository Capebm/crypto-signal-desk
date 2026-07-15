export type SessionWindow = 'ny_open' | 'ny' | 'ny_close' | 'london' | 'quiet' | 'off'

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

/**
 * Killzones estilo TJR (futures US), em America/New_York:
 * - 09:30–11:00 open → COMPRAR JÁ
 * - 11:00–15:00 mid → só AGUARDAR (exceto agressivo)
 * - 15:00–16:00 fecho → sem novas entradas
 * - Londres 03:00–08:30 → AGUARDAR
 * - resto / Asia deep → quiet ou off
 */
export function getTradingSessionStatus(date = new Date()): TradingSessionStatus {
  const ny = zoneParts('America/New_York', date)
  const lisbon = zoneParts('Europe/Lisbon', date)
  const base = { nowLisbon: lisbon.label, nowNy: ny.label }

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

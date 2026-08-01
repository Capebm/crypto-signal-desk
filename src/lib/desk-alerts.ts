const ALERTS_KEY = 'tjr-buy-now-alerts'
const DEDUPE_KEY = 'tjr-alert-dedupe'
const DEDUPE_TTL_MS = 45 * 60_000

export function alertsEnabled(): boolean {
  try {
    return localStorage.getItem(ALERTS_KEY) === '1'
  } catch {
    return false
  }
}

export function setAlertsEnabled(on: boolean) {
  try {
    localStorage.setItem(ALERTS_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

const recentKey = (symbol: string) => `${symbol}:${Math.floor(Date.now() / DEDUPE_TTL_MS)}`

function alreadyAlerted(symbol: string): boolean {
  try {
    const raw = localStorage.getItem(DEDUPE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const key = recentKey(symbol)
    return Boolean(map[key])
  } catch {
    return false
  }
}

function markAlerted(symbol: string) {
  try {
    const raw = localStorage.getItem(DEDUPE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const now = Date.now()
    for (const [k, ts] of Object.entries(map)) {
      if (now - ts > DEDUPE_TTL_MS * 2) delete map[k]
    }
    map[recentKey(symbol)] = now
    localStorage.setItem(DEDUPE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/** Notifica COMPRAR/LONG/SHORT JÁ se alertas ligados e permissão ok. Dedup ~45min. */
export async function notifyActionNow(opts: {
  title: string
  body: string
  symbol: string
}): Promise<boolean> {
  if (!alertsEnabled()) return false
  if (alreadyAlerted(opts.symbol)) return false
  const ok = await ensureNotificationPermission()
  if (!ok) return false
  try {
    new Notification(opts.title, { body: opts.body, tag: `csd-${opts.symbol}` })
    markAlerted(opts.symbol)
    return true
  } catch {
    return false
  }
}

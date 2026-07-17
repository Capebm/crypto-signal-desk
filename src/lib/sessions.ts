import type { Candle } from './types'

/** TJR-style sessions in America/New_York (crypto 24/7). */
export type SessionName = 'asia' | 'london' | 'newyork'

export type SessionLine = {
  session: SessionName
  kind: 'high' | 'low'
  price: number
  title: string
  color: string
}

export type PreviousDayLine = {
  kind: 'high' | 'low'
  price: number
  title: string
  color: string
}

const sessionColors: Record<SessionName, string> = {
  asia: '#737373',
  london: '#a3a3a3',
  newyork: '#3ecf8e',
}

const sessionLabels: Record<SessionName, string> = {
  asia: 'Ásia',
  london: 'Londres',
  newyork: 'NY',
}

type NyParts = { year: number; month: number; day: number; hour: number; minute: number }

const nyParts = (ts: number): NyParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ts))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

const dateKey = (p: NyParts) => `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`

const addCalendarDays = (key: string, delta: number) => {
  const [y, m, d] = key.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + delta))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

const minutesOfDay = (h: number, m: number) => h * 60 + m

/** 18:00–02:59, 03:00–08:29, 08:30–16:59, 17:00–17:59 spread (ignored). */
export const classifyNySession = (hour: number, minute: number): SessionName | 'spread' => {
  const mins = minutesOfDay(hour, minute)
  if (mins >= 18 * 60 || mins < 3 * 60) return 'asia'
  if (mins >= 3 * 60 && mins < 8 * 60 + 30) return 'london'
  if (mins >= 8 * 60 + 30 && mins < 17 * 60) return 'newyork'
  return 'spread'
}

/** Session instance key: asia starts at 18:00 on its calendar date. */
const sessionInstanceKey = (ts: number): { key: string; session: SessionName } | undefined => {
  const p = nyParts(ts)
  const session = classifyNySession(p.hour, p.minute)
  if (session === 'spread') return undefined
  if (session === 'asia') {
    const anchor = p.hour >= 18 ? dateKey(p) : addCalendarDays(dateKey(p), -1)
    return { key: `asia@${anchor}`, session }
  }
  return { key: `${session}@${dateKey(p)}`, session }
}

type Bucket = { session: SessionName; high: number; low: number; sortKey: string }

const bump = (map: Map<string, Bucket>, key: string, session: SessionName, candle: Candle) => {
  const existing = map.get(key)
  if (!existing) {
    map.set(key, { session, high: candle.high, low: candle.low, sortKey: key })
    return
  }
  existing.high = Math.max(existing.high, candle.high)
  existing.low = Math.min(existing.low, candle.low)
}

/** Latest completed or in-progress high/low per session (TJR draws on liquidity). */
export function latestSessionLevels(candles: Candle[]): SessionLine[] {
  const buckets = new Map<string, Bucket>()
  for (const candle of candles) {
    const inst = sessionInstanceKey(candle.openTime)
    if (!inst) continue
    bump(buckets, inst.key, inst.session, candle)
  }

  const bySession = new Map<SessionName, Bucket>()
  for (const bucket of buckets.values()) {
    const prev = bySession.get(bucket.session)
    if (!prev || bucket.sortKey > prev.sortKey) bySession.set(bucket.session, bucket)
  }

  const lines: SessionLine[] = []
  for (const session of ['asia', 'london', 'newyork'] as SessionName[]) {
    const bucket = bySession.get(session)
    if (!bucket) continue
    const label = sessionLabels[session]
    const color = sessionColors[session]
    lines.push({ session, kind: 'high', price: bucket.high, title: `${label} H`, color })
    lines.push({ session, kind: 'low', price: bucket.low, title: `${label} L`, color })
  }
  return lines
}

/** Previous NY calendar day high/low (all sessions combined). */
export function previousDayLevels(candles: Candle[]): PreviousDayLine[] {
  if (candles.length === 0) return []
  const dates = [...new Set(candles.map((c) => dateKey(nyParts(c.openTime))))].sort()
  if (dates.length < 2) return []
  const yKey = dates.at(-2)!

  const dayCandles = candles.filter((c) => dateKey(nyParts(c.openTime)) === yKey)
  if (dayCandles.length === 0) return []

  const high = Math.max(...dayCandles.map((c) => c.high))
  const low = Math.min(...dayCandles.map((c) => c.low))
  const color = '#787b86'
  return [
    { kind: 'high', price: high, title: 'Dia ant. H', color },
    { kind: 'low', price: low, title: 'Dia ant. L', color },
  ]
}

export const sessionLinesForChart = (candles: Candle[], includePreviousDay = true) => [
  ...latestSessionLevels(candles),
  ...(includePreviousDay ? previousDayLevels(candles) : []),
]

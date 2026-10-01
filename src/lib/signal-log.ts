import { APP_VERSION } from './app-version'
import { currentDeskUser, hasDeskSession, supabase } from './supabase'
import type { RiskWarningCode } from './risk-rules'
import { resolveT212BinancePair } from './t212-binance-feed'
import type { InstrumentKind } from './trade-levels'
import type { Candle } from './types'
import { fetchYahooCandlesRaw } from './yahoo-market'

/**
 * Registo de sinais JÁ → Supabase (via /api/signals). Cada sinal é resolvido depois
 * com velas 5m (TP / SL / expirado) para medir a expectancy real por versão e aviso.
 */

export type SignalStatus = 'open' | 'tp' | 'sl' | 'expired' | 'ambiguous'

export type SignalRecord = {
  signal_key: string
  venue: 'spot' | 't212'
  symbol: string
  base: string
  instrument_kind: InstrumentKind
  /** 'binance:NOMUSDC' ou 'yahoo:NQ=F' — onde ir buscar velas para resolver. */
  data_symbol?: string
  side: 'long' | 'short'
  entry: number
  stop: number
  target: number
  rr: number
  score: number
  profile?: string
  tp_mode?: string
  session?: string
  warnings: RiskWarningCode[]
  app_version: string
  signal_at: string
}

export type StoredSignal = SignalRecord & {
  id: string
  created_at: string
  status: SignalStatus
  resolved_at?: string | null
  exit_price?: number | null
  r_multiple?: number | null
  mfe_r?: number | null
  mae_r?: number | null
}

export type SignalResolution = {
  status: Exclude<SignalStatus, 'open'>
  resolved_at: string
  exit_price: number
  r_multiple: number
  mfe_r: number
  mae_r: number
}

/** Janela máxima para o sinal chegar a TP/SL; depois conta o R no fecho. */
export const SIGNAL_EXPIRY_MS = 48 * 3_600_000
const BUCKET_MS = 15 * 60_000

export function signalKey(venue: string, base: string, side: string, at: number): string {
  return `${venue}|${base.toUpperCase()}|${side}|${Math.floor(at / BUCKET_MS)}`
}

export type BuildSignalInput = {
  venue: 'spot' | 't212'
  symbol: string
  base: string
  instrumentKind: InstrumentKind
  dataSymbol?: string
  side: 'long' | 'short'
  entry?: number
  stop?: number
  target?: number
  riskReward?: number
  score: number
  profile?: string
  tpMode?: string
  session?: string
  warnings: RiskWarningCode[]
  at: Date
}

/** Valida níveis e devolve o registo; undefined se o sinal não tiver níveis coerentes. */
export function buildSignalRecord(input: BuildSignalInput): SignalRecord | undefined {
  const { entry, stop, target } = input
  if (!entry || !stop || !target || entry <= 0) return undefined
  const long = input.side === 'long'
  if (long ? !(stop < entry && target > entry) : !(stop > entry && target < entry)) return undefined
  const rr = input.riskReward ?? Math.abs(target - entry) / Math.abs(entry - stop)
  return {
    signal_key: signalKey(input.venue, input.base, input.side, input.at.getTime()),
    venue: input.venue,
    symbol: input.symbol,
    base: input.base.toUpperCase(),
    instrument_kind: input.instrumentKind,
    data_symbol: input.dataSymbol,
    side: input.side,
    entry,
    stop,
    target,
    rr: Math.round(rr * 100) / 100,
    score: Math.round(input.score),
    profile: input.profile,
    tp_mode: input.tpMode,
    session: input.session,
    warnings: input.warnings,
    app_version: APP_VERSION ?? 'dev',
    signal_at: input.at.toISOString(),
  }
}

/**
 * Percorre velas depois do sinal. Stop e alvo na mesma vela → 'ambiguous' contado como −1R
 * (conservador). Sem toque até expirar → R no fecho da última vela dentro da janela.
 */
export function resolveSignalOutcome(
  signal: Pick<SignalRecord, 'side' | 'entry' | 'stop' | 'target' | 'signal_at'>,
  candles: Candle[],
  candleMs = 5 * 60_000,
): SignalResolution | undefined {
  const start = Date.parse(signal.signal_at)
  const risk = Math.abs(signal.entry - signal.stop)
  if (!Number.isFinite(start) || !(risk > 0)) return undefined
  const expiry = start + SIGNAL_EXPIRY_MS
  const long = signal.side === 'long'
  const toR = (price: number) => (long ? price - signal.entry : signal.entry - price) / risk
  let mfe = 0
  let mae = 0
  let last: Candle | undefined
  const sorted = [...candles].sort((a, b) => a.openTime - b.openTime)
  for (const candle of sorted) {
    // Só velas que abrem depois do sinal: a parte da vela antes do sinal não conta.
    if (candle.openTime < start) continue
    if (candle.openTime >= expiry) break
    last = candle
    const favorable = toR(long ? candle.high : candle.low)
    const adverse = toR(long ? candle.low : candle.high)
    mfe = Math.max(mfe, favorable)
    mae = Math.min(mae, adverse)
    const hitStop = long ? candle.low <= signal.stop : candle.high >= signal.stop
    const hitTarget = long ? candle.high >= signal.target : candle.low <= signal.target
    const resolvedAt = new Date(candle.openTime + candleMs).toISOString()
    const round = (value: number) => Math.round(value * 100) / 100
    if (hitStop && hitTarget) {
      return { status: 'ambiguous', resolved_at: resolvedAt, exit_price: signal.stop, r_multiple: -1, mfe_r: round(mfe), mae_r: round(mae) }
    }
    if (hitStop) {
      return { status: 'sl', resolved_at: resolvedAt, exit_price: signal.stop, r_multiple: -1, mfe_r: round(mfe), mae_r: round(mae) }
    }
    if (hitTarget) {
      return { status: 'tp', resolved_at: resolvedAt, exit_price: signal.target, r_multiple: round(toR(signal.target)), mfe_r: round(mfe), mae_r: round(mae) }
    }
  }
  const lastClose = last ? last.openTime + candleMs : 0
  if (last && lastClose >= expiry - candleMs) {
    return {
      status: 'expired',
      resolved_at: new Date(expiry).toISOString(),
      exit_price: last.close,
      r_multiple: Math.round(toR(last.close) * 100) / 100,
      mfe_r: Math.round(mfe * 100) / 100,
      mae_r: Math.round(mae * 100) / 100,
    }
  }
  return undefined
}

export type SignalBucket = { n: number; wins: number; sumR: number }

export type SignalStats = {
  total: number
  open: number
  resolved: number
  winRate: number
  avgR: number
  /** Soma de R de todos os sinais resolvidos. */
  totalR: number
  byVersion: Record<string, SignalBucket>
  byWarning: Record<string, SignalBucket>
  byVenue: Record<string, SignalBucket>
  byKind: Record<string, SignalBucket>
  byHourUtc: Record<string, SignalBucket>
}

const add = (map: Record<string, SignalBucket>, key: string, r: number) => {
  const row = map[key] ?? { n: 0, wins: 0, sumR: 0 }
  row.n += 1
  row.sumR += r
  if (r > 0) row.wins += 1
  map[key] = row
}

export function computeSignalStats(signals: StoredSignal[]): SignalStats {
  const stats: SignalStats = {
    total: signals.length,
    open: 0,
    resolved: 0,
    winRate: 0,
    avgR: 0,
    totalR: 0,
    byVersion: {},
    byWarning: {},
    byVenue: {},
    byKind: {},
    byHourUtc: {},
  }
  let wins = 0
  for (const signal of signals) {
    if (signal.status === 'open' || signal.r_multiple === null || signal.r_multiple === undefined) {
      stats.open += 1
      continue
    }
    const r = signal.r_multiple
    stats.resolved += 1
    stats.totalR += r
    if (r > 0) wins += 1
    add(stats.byVersion, signal.app_version, r)
    add(stats.byVenue, signal.venue === 't212' ? 'T212' : 'Spot', r)
    add(stats.byKind, signal.instrument_kind, r)
    add(stats.byHourUtc, `${String(new Date(signal.signal_at).getUTCHours()).padStart(2, '0')}h`, r)
    if (signal.warnings.length === 0) add(stats.byWarning, 'sem_aviso', r)
    for (const code of signal.warnings) add(stats.byWarning, code, r)
  }
  stats.winRate = stats.resolved > 0 ? (wins / stats.resolved) * 100 : 0
  stats.avgR = stats.resolved > 0 ? stats.totalR / stats.resolved : 0
  return stats
}

// ── Cliente Supabase ───────────────────────────────────────────────────────

const QUEUE_KEY = 'desk-signal-queue-v1'
const SENT_KEYS_KEY = 'desk-signal-sent-v1'

export type DbState = 'ok' | 'signed-out' | 'forbidden' | 'offline'

export class DeskDbError extends Error {
  constructor(message: string, readonly state: DbState) {
    super(message)
  }
}

/** Erros do PostgREST → estado legível; RLS a recusar = sessão de outro email. */
function dbError(error: { message: string; code?: string }): DeskDbError {
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) {
    return new DeskDbError('Esta conta não tem acesso aos dados do Desk', 'forbidden')
  }
  return new DeskDbError(error.message || 'Falha na BD', 'offline')
}

export async function requireDeskUser() {
  const user = await currentDeskUser()
  if (!user) throw new DeskDbError('Entra com o teu email na tab Sinais', 'signed-out')
  return user
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function pendingSignalCount(): number {
  return readJson<SignalRecord[]>(QUEUE_KEY, []).length
}

/**
 * Enfileira sinais novos (dedupe local por signal_key) e tenta enviar a fila.
 * Falha de rede/BD não perde nada: fica na fila para o próximo envio.
 */
export async function logSignals(records: SignalRecord[]): Promise<{ sent: number; queued: number; state: DbState }> {
  const sentKeys = new Set(readJson<string[]>(SENT_KEYS_KEY, []))
  const queue = readJson<SignalRecord[]>(QUEUE_KEY, [])
  const queuedKeys = new Set(queue.map((row) => row.signal_key))
  for (const record of records) {
    if (sentKeys.has(record.signal_key) || queuedKeys.has(record.signal_key)) continue
    queue.push(record)
    queuedKeys.add(record.signal_key)
  }
  writeJson(QUEUE_KEY, queue.slice(-500))
  return flushSignalQueue()
}

export async function flushSignalQueue(): Promise<{ sent: number; queued: number; state: DbState }> {
  const queue = readJson<SignalRecord[]>(QUEUE_KEY, [])
  if (!queue.length) return { sent: 0, queued: 0, state: hasDeskSession() ? 'ok' : 'signed-out' }
  try {
    const user = await requireDeskUser()
    const batch = queue.slice(0, 200)
    const { error } = await supabase
      .from('signals')
      .upsert(batch.map((row) => ({ ...row, user_id: user.id })), { onConflict: 'user_id,signal_key', ignoreDuplicates: true })
    if (error) throw dbError(error)
    const sentKeys = readJson<string[]>(SENT_KEYS_KEY, [])
    writeJson(SENT_KEYS_KEY, [...sentKeys, ...batch.map((row) => row.signal_key)].slice(-2000))
    const rest = queue.slice(batch.length)
    writeJson(QUEUE_KEY, rest)
    return { sent: batch.length, queued: rest.length, state: 'ok' }
  } catch (error) {
    return { sent: 0, queued: queue.length, state: error instanceof DeskDbError ? error.state : 'offline' }
  }
}

export async function fetchSignals(status?: SignalStatus): Promise<StoredSignal[]> {
  await requireDeskUser()
  let query = supabase.from('signals').select('*').order('signal_at', { ascending: false }).limit(1000)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw dbError(error)
  return (data ?? []) as StoredSignal[]
}

async function fetchCandlesSince(dataSymbol: string, since: number): Promise<Candle[]> {
  const [source, symbol] = dataSymbol.split(':', 2)
  if (source === 'binance') {
    const params = new URLSearchParams({ symbol, interval: '5m', startTime: String(since), limit: '1000' })
    const response = await fetch(`https://api.binance.com/api/v3/klines?${params}`)
    if (!response.ok) throw new Error(`Binance ${response.status}`)
    const rows = (await response.json()) as [number, string, string, string, string, string][]
    return rows.map(([openTime, open, high, low, close, volume]) => ({
      openTime,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    }))
  }
  if (source === 'binance-t212') {
    const pair = await resolveT212BinancePair(symbol)
    if (!pair) throw new Error(`Sem par Binance para ${symbol}`)
    return fetchCandlesSince(`binance:${pair}`, since)
  }
  if (source === 'yahoo') {
    return fetchYahooCandlesRaw(symbol, '5m')
  }
  throw new Error(`Fonte desconhecida: ${dataSymbol}`)
}

/** Resolve sinais abertos e grava o resultado. Devolve quantos foram fechados. */
export async function resolveOpenSignals(signals: StoredSignal[]): Promise<number> {
  let resolved = 0
  for (const signal of signals) {
    if (signal.status !== 'open' || !signal.data_symbol) continue
    // Ainda não houve uma vela 5m completa depois do sinal.
    if (Date.now() - Date.parse(signal.signal_at) < 10 * 60_000) continue
    try {
      const candles = await fetchCandlesSince(signal.data_symbol, Date.parse(signal.signal_at))
      const outcome = resolveSignalOutcome(signal, candles)
      if (!outcome) continue
      const { error } = await supabase.from('signals').update(outcome).eq('id', signal.id)
      if (error) throw dbError(error)
      Object.assign(signal, outcome)
      resolved += 1
    } catch (error) {
      if (error instanceof DeskDbError) throw error
      // Falha de velas num símbolo não pára os restantes.
    }
  }
  return resolved
}

const CACHE_KEY = 'desk-signal-cache-v1'

/** Última leitura da BD — o Diário liga trades a sinais mesmo offline. */
export function readSignalCache(): { at?: string; signals: StoredSignal[] } {
  return readJson<{ at?: string; signals: StoredSignal[] }>(CACHE_KEY, { signals: [] })
}

export function writeSignalCache(signals: StoredSignal[]) {
  writeJson(CACHE_KEY, { at: new Date().toISOString(), signals })
}

/** Lê, resolve abertos e actualiza a cache. */
export async function refreshSignals(): Promise<{ signals: StoredSignal[]; resolved: number }> {
  await flushSignalQueue()
  const signals = await fetchSignals()
  const resolved = await resolveOpenSignals(signals)
  writeSignalCache(signals)
  return { signals, resolved }
}

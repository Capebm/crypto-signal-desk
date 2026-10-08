import type { Candle } from './types'

/**
 * Índices US na T212 seguem os futuros (NQ/ES/YM), que no Yahoo chegam ~10 min atrasados.
 * Os índices à vista (^NDX, ^GSPC, ^DJI) chegam ao vivo durante a sessão de NY.
 * Mantém-se o histórico dos futuros (sessões Ásia/Londres para os draws) e cola-se por cima
 * a cauda ao vivo do índice, deslocada pela diferença futuro − índice medida agora.
 */
export const US_INDEX_LIVE_SYMBOL: Record<string, string> = {
  tech100: '^NDX',
  nq: '^NDX',
  us500: '^GSPC',
  es: '^GSPC',
  us30: '^DJI',
  ym: '^DJI',
}

/** A cauda do índice só serve se tiver uma vela 1m própria e recente (sessão de NY aberta). */
export const LIVE_MAX_AGE_MS = 3 * 60_000

type Frames = Record<'1h' | '15m' | '5m' | '1m', Candle[]>

/** Futuro − índice: mediana das últimas 10 velas que existem nos dois (tira o ruído de um minuto). */
export function futuresBasis(futures: Candle[], index: Candle[]): number | undefined {
  const indexByTime = new Map(index.map((candle) => [candle.openTime, candle]))
  const diffs: number[] = []
  for (let i = futures.length - 1; i >= 0 && diffs.length < 10; i -= 1) {
    const match = indexByTime.get(futures[i].openTime)
    if (match) diffs.push(futures[i].close - match.close)
  }
  if (!diffs.length) return undefined
  const sorted = diffs.sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const shift = (candle: Candle, basis: number): Candle => ({
  ...candle,
  open: candle.open + basis,
  high: candle.high + basis,
  low: candle.low + basis,
  close: candle.close + basis,
})

/**
 * Junta ao histórico dos futuros as velas do índice mais recentes que ele.
 * A vela em curso que existe nos dois é actualizada (máx/mín/fecho), não duplicada.
 */
export function spliceLiveTail(base: Candle[], live: Candle[], basis: number): Candle[] {
  const last = base.at(-1)
  if (!last) return base
  const out = base.slice(0, -1)
  const sameBar = live.find((candle) => candle.openTime === last.openTime)
  if (sameBar) {
    const shifted = shift(sameBar, basis)
    out.push({
      ...last,
      high: Math.max(last.high, shifted.high),
      low: Math.min(last.low, shifted.low),
      close: shifted.close,
    })
  } else {
    out.push(last)
  }
  for (const candle of live) {
    if (candle.openTime > last.openTime) out.push(shift(candle, basis))
  }
  return out
}

/** Agrupa velas na grelha de `ms` (a dos futuros: horas e quartos de hora certos). */
export function bucketCandles(candles: Candle[], ms: number): Candle[] {
  const out: Candle[] = []
  for (const candle of candles) {
    const openTime = Math.floor(candle.openTime / ms) * ms
    const bar = out.at(-1)
    if (bar && bar.openTime === openTime) {
      bar.high = Math.max(bar.high, candle.high)
      bar.low = Math.min(bar.low, candle.low)
      bar.close = candle.close
      bar.volume += candle.volume
    } else {
      out.push({ ...candle, openTime })
    }
  }
  return out
}

const MIN = 60_000

/** Aplica a cauda ao vivo a todos os timeframes; devolve undefined se não houver dados ao vivo utilizáveis. */
export function withLiveIndexTail(futures: Frames, index: Frames, now = Date.now()): (Frames & { basis: number }) | undefined {
  const latest = index['1m'].at(-1)
  if (!latest || now - latest.openTime > LIVE_MAX_AGE_MS) return undefined
  // O Yahoo marca a vela em curso com a hora do último tick (ex. 14:32 numa vela de 1h): alinha tudo à grelha.
  const fut = {
    '1h': bucketCandles(futures['1h'], 60 * MIN),
    '15m': bucketCandles(futures['15m'], 15 * MIN),
    '5m': bucketCandles(futures['5m'], 5 * MIN),
    '1m': futures['1m'] === futures['5m'] ? undefined : bucketCandles(futures['1m'], MIN),
  }
  const idx5 = bucketCandles(index['5m'], 5 * MIN)
  const idx1 = bucketCandles(index['1m'], MIN)
  // Sem 1m próprio nos futuros (fallback = 5m), mede a diferença no 5m.
  const basis = fut['1m'] ? futuresBasis(fut['1m'], idx1) : futuresBasis(fut['5m'], idx5)
  if (basis === undefined) return undefined
  const fiveMinute = spliceLiveTail(fut['5m'], idx5, basis)
  // O 1h do índice no Yahoo começa às 09:30; o dos futuros à hora certa → reagrupa a partir do 5m.
  return {
    basis,
    '1h': spliceLiveTail(fut['1h'], bucketCandles(idx5, 60 * MIN), basis),
    '15m': spliceLiveTail(fut['15m'], bucketCandles(idx5, 15 * MIN), basis),
    '5m': fiveMinute,
    // Mesmo array que o 5m = «sem 1m real»: a regra de dados live continua a pedir confirmação.
    '1m': fut['1m'] ? spliceLiveTail(fut['1m'], idx1, basis) : fiveMinute,
  }
}

import { findTjrSwings, type SwingPoint } from './tjr-structure'
import type { Candle } from './types'

export type EsNqLiquiditySmt = {
  direction?: 'bullish' | 'bearish'
  kind?: 'high' | 'low'
  fresh: boolean
  feedValid: boolean
  pairedAt?: number
  esMadeExtreme?: boolean
  nqMadeExtreme?: boolean
  note: string
}

type SmtOptions = {
  lookback?: number
  pairToleranceMs?: number
  maxFeedSkewMs?: number
  maxAgeMs?: number
  recencyCandles?: number
  now?: number
}

type PairedCandles = { es: Candle[]; nq: Candle[] }

const pairCandles = (
  esCandles: Candle[],
  nqCandles: Candle[],
  toleranceMs: number,
  lookback: number,
): PairedCandles => {
  const es: Candle[] = []
  const nq: Candle[] = []
  const candidates = nqCandles.slice(-lookback)
  const used = new Set<number>()
  for (const esCandle of esCandles.slice(-lookback)) {
    let best: Candle | undefined
    let bestIndex: number | undefined
    let bestDelta = Number.POSITIVE_INFINITY
    for (let index = 0; index < candidates.length; index += 1) {
      if (used.has(index)) continue
      const nqCandle = candidates[index]
      const delta = Math.abs(nqCandle.openTime - esCandle.openTime)
      if (delta <= toleranceMs && delta < bestDelta) {
        best = nqCandle
        bestIndex = index
        bestDelta = delta
      }
    }
    if (best && bestIndex !== undefined) {
      used.add(bestIndex)
      es.push(esCandle)
      nq.push(best)
    }
  }
  return { es, nq }
}

type SwingPair = { es: SwingPoint; nq: SwingPoint; index: number }

const pairSwings = (
  esSwings: SwingPoint[],
  nqSwings: SwingPoint[],
  type: SwingPoint['type'],
): SwingPair[] => {
  const out: SwingPair[] = []
  const used = new Set<number>()
  for (const es of esSwings.filter((s) => s.type === type)) {
    let best: SwingPoint | undefined
    let bestDelta = Number.POSITIVE_INFINITY
    for (const nq of nqSwings.filter((s) => s.type === type && !used.has(s.index))) {
      const delta = Math.abs(nq.index - es.index)
      if (delta <= 1 && delta < bestDelta) {
        best = nq
        bestDelta = delta
      }
    }
    if (best) {
      used.add(best.index)
      out.push({ es, nq: best, index: Math.max(es.index, best.index) })
    }
  }
  return out
}

type DivergenceCandidate = {
  direction: 'bullish' | 'bearish'
  kind: 'high' | 'low'
  index: number
  esMadeExtreme: boolean
  nqMadeExtreme: boolean
}

const divergenceFromPairs = (
  pairs: SwingPair[],
  kind: 'high' | 'low',
): DivergenceCandidate | undefined => {
  if (pairs.length < 2) return undefined
  const previous = pairs.at(-2)!
  const latest = pairs.at(-1)!
  const esMadeExtreme = kind === 'high'
    ? latest.es.price > previous.es.price
    : latest.es.price < previous.es.price
  const nqMadeExtreme = kind === 'high'
    ? latest.nq.price > previous.nq.price
    : latest.nq.price < previous.nq.price
  if (esMadeExtreme === nqMadeExtreme) return undefined
  return {
    direction: kind === 'high' ? 'bearish' : 'bullish',
    kind,
    index: latest.index,
    esMadeExtreme,
    nqMadeExtreme,
  }
}

/** ES↔NQ 5m: um faz novo extremo de liquidez e o outro falha. */
export function computeEsNqLiquiditySmt(
  es5m: Candle[],
  nq5m: Candle[],
  options: SmtOptions = {},
): EsNqLiquiditySmt {
  const lookback = options.lookback ?? 60
  const pairToleranceMs = options.pairToleranceMs ?? 300_000
  const maxFeedSkewMs = options.maxFeedSkewMs ?? 600_000
  const maxAgeMs = options.maxAgeMs ?? 12 * 60_000
  const recencyCandles = options.recencyCandles ?? 6
  const now = options.now ?? Date.now()
  const esLast = es5m.at(-1)
  const nqLast = nq5m.at(-1)
  if (!esLast || !nqLast) {
    return { fresh: false, feedValid: false, note: 'ES/NQ sem candles 5m.' }
  }
  if (Math.abs(esLast.openTime - nqLast.openTime) > maxFeedSkewMs) {
    return { fresh: false, feedValid: false, note: 'ES/NQ 5m desalinhados no tempo.' }
  }
  if (now - Math.min(esLast.openTime, nqLast.openTime) > maxAgeMs) {
    return { fresh: false, feedValid: false, note: 'ES/NQ 5m atrasados — SMT indisponível.' }
  }

  const paired = pairCandles(es5m, nq5m, pairToleranceMs, lookback)
  if (paired.es.length < 12) {
    return { fresh: false, feedValid: false, note: 'ES/NQ sem pares 5m suficientes.' }
  }
  const esSwings = findTjrSwings(paired.es)
  const nqSwings = findTjrSwings(paired.nq)
  const high = divergenceFromPairs(pairSwings(esSwings, nqSwings, 'high'), 'high')
  const low = divergenceFromPairs(pairSwings(esSwings, nqSwings, 'low'), 'low')
  const candidate = !high ? low : !low ? high : high.index >= low.index ? high : low
  if (!candidate) {
    return { fresh: false, feedValid: true, note: 'ES/NQ 5m sem divergência SMT recente.' }
  }
  const fresh = candidate.index >= paired.es.length - recencyCandles
  if (!fresh) {
    return { fresh: false, feedValid: true, note: 'ES/NQ SMT antigo — informativo.' }
  }
  const pairedAt = paired.es[candidate.index]?.openTime
  const extreme = candidate.esMadeExtreme ? 'ES fez extremo; NQ falhou' : 'NQ fez extremo; ES falhou'
  return {
    direction: candidate.direction,
    kind: candidate.kind,
    fresh: true,
    feedValid: true,
    pairedAt,
    esMadeExtreme: candidate.esMadeExtreme,
    nqMadeExtreme: candidate.nqMadeExtreme,
    note: `SMT ${candidate.direction} em ${candidate.kind === 'high' ? 'highs' : 'lows'} · ${extreme}.`,
  }
}

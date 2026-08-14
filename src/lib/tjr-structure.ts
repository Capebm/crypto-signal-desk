import type { Candle, Direction, PriceZone } from './types'
import { previousDayLevelsUntil, sessionLevelsUntil } from './sessions'

export type SwingPoint = { type: 'high' | 'low'; price: number; index: number }
const swingsCache = new WeakMap<Candle[], SwingPoint[]>()

const isUp = (c: Candle) => c.close >= c.open
const isDown = (c: Candle) => c.close < c.open

/** TJR: up + down = high; down + up = low (highest/lowest wick of the pair). */
export function findTjrSwings(candles: Candle[]): SwingPoint[] {
  const cached = swingsCache.get(candles)
  if (cached) return cached
  const swings: SwingPoint[] = []
  for (let index = 1; index < candles.length; index += 1) {
    const prev = candles[index - 1]
    const curr = candles[index]
    if (isUp(prev) && isDown(curr)) swings.push({ type: 'high', price: Math.max(prev.high, curr.high), index })
    if (isDown(prev) && isUp(curr)) swings.push({ type: 'low', price: Math.min(prev.low, curr.low), index })
  }
  swingsCache.set(candles, swings)
  return swings
}

export function trendFromSwings(swings: SwingPoint[]): Direction {
  const highs = swings.filter((s) => s.type === 'high').map((s) => s.price)
  const lows = swings.filter((s) => s.type === 'low').map((s) => s.price)
  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs.at(-1)! > highs.at(-2)!
    const hl = lows.at(-1)! > lows.at(-2)!
    const lh = highs.at(-1)! < highs.at(-2)!
    const ll = lows.at(-1)! < lows.at(-2)!
    if (hh && hl) return 'bullish'
    if (lh && ll) return 'bearish'
  }
  return 'neutral'
}

export type FairValueGap = PriceZone & {
  bullish: boolean
  index: number
  disrespected: boolean
  /** Primeiro candle que negociou de volta dentro da gap. */
  firstTouchAt?: number
  /** Primeiro fecho além da fronteira externa da gap. */
  invalidatedAt?: number
}

export type FairValueGapStack = {
  bullish: boolean
  gaps: FairValueGap[]
  low: number
  high: number
  index: number
  disrespected: boolean
  invalidatedAt?: number
}

export type ConfirmedBlock = PriceZone & {
  direction: 'bullish' | 'bearish'
  sourceIndex: number
  createdAt: number
  invalidatedAt?: number
}

export function findFairValueGaps(candles: Candle[], lookback = 40): FairValueGap[] {
  const gaps: FairValueGap[] = []
  const start = Math.max(2, candles.length - lookback)
  for (let index = start; index < candles.length; index += 1) {
    const first = candles[index - 2]
    const middle = candles[index - 1]
    const third = candles[index]
    const body = Math.abs(middle.close - middle.open)
    const avgBody = average(candles.slice(Math.max(0, index - 12), index).map((c) => Math.abs(c.close - c.open)))
    if (body < avgBody * 0.6) continue

    if (third.low > first.high) {
      gaps.push(makeGap(first.high, third.low, true, index, candles, index))
    } else if (third.high < first.low) {
      gaps.push(makeGap(third.high, first.low, false, index, candles, index))
    }
  }
  return gaps
}

const makeGap = (low: number, high: number, bullish: boolean, index: number, candles: Candle[], fromIndex: number): FairValueGap => {
  let disrespected = false
  let firstTouchAt: number | undefined
  let invalidatedAt: number | undefined
  for (let candleIndex = fromIndex + 1; candleIndex < candles.length; candleIndex += 1) {
    const candle = candles[candleIndex]
    const touched = bullish ? candle.low <= high : candle.high >= low
    if (touched && firstTouchAt === undefined) firstTouchAt = candleIndex
    if ((bullish && candle.close < low) || (!bullish && candle.close > high)) {
      disrespected = true
      invalidatedAt = candleIndex
      break
    }
  }
  return { low, high, kind: 'fair-value-gap', bullish, index, disrespected, firstTouchAt, invalidatedAt }
}

/**
 * TJR 2026: FVGs consecutivas na mesma expansão, sem retrace entre elas,
 * formam uma faixa. A inversão só conta após fechar além da gap controladora.
 */
export function findFairValueGapStacks(gaps: FairValueGap[]): FairValueGapStack[] {
  const stacks: FairValueGapStack[] = []
  for (const gap of [...gaps].sort((a, b) => a.index - b.index)) {
    const current = stacks.at(-1)
    const previous = current?.gaps.at(-1)
    const sameUnretracedExpansion = Boolean(
      current
      && previous
      && current.bullish === gap.bullish
      && gap.index - previous.index <= 2
      && (previous.firstTouchAt === undefined || previous.firstTouchAt > gap.index),
    )
    if (sameUnretracedExpansion && current) {
      current.gaps.push(gap)
      current.low = Math.min(current.low, gap.low)
      current.high = Math.max(current.high, gap.high)
      current.index = gap.index
      const invalidations = current.gaps.map((item) => item.invalidatedAt)
      current.disrespected = invalidations.every((value) => value !== undefined)
      current.invalidatedAt = current.disrespected
        ? Math.max(...invalidations.filter((value): value is number => value !== undefined))
        : undefined
      continue
    }
    stacks.push({
      bullish: gap.bullish,
      gaps: [gap],
      low: gap.low,
      high: gap.high,
      index: gap.index,
      disrespected: gap.disrespected,
      invalidatedAt: gap.invalidatedAt,
    })
  }
  return stacks
}

const bosEventAt = (candles: Candle[], index: number): Direction | undefined => {
  if (index < 3) return undefined
  const prior = candles.slice(0, index)
  const swings = findTjrSwings(prior)
  const lastHigh = swings.filter((s) => s.type === 'high').at(-1)?.price
  const lastLow = swings.filter((s) => s.type === 'low').at(-1)?.price
  const previousClose = candles[index - 1]?.close
  const close = candles[index]?.close
  if (lastHigh !== undefined && previousClose <= lastHigh && close > lastHigh) return 'bullish'
  if (lastLow !== undefined && previousClose >= lastLow && close < lastLow) return 'bearish'
  return undefined
}

const confirmationEventAt = (candles: Candle[], index: number): Direction | undefined => {
  const bos = bosEventAt(candles, index)
  if (bos === 'bullish' || bos === 'bearish') return bos
  const slice = candles.slice(0, index + 1)
  return recentInverseFvg(findFairValueGaps(slice), trendFromSwings(findTjrSwings(slice)), index)
}

export type ConfirmationEvent = {
  direction: Exclude<Direction, 'neutral'>
  via: 'bos' | 'ifvg'
  candleIndex: number
  openTime: number
}

/** Último BOS/iFVG real, para preservar a ordem temporal sweep → confirmação. */
export function latestConfirmationEvent(
  candles: Candle[],
  options: { lookback?: number; allowPermissiveIfvg?: boolean } = {},
): ConfirmationEvent | undefined {
  const start = Math.max(3, candles.length - (options.lookback ?? 80))
  for (let index = candles.length - 1; index >= start; index -= 1) {
    const bos = bosEventAt(candles, index)
    if (bos === 'bullish' || bos === 'bearish') {
      return { direction: bos, via: 'bos', candleIndex: index, openTime: candles[index].openTime }
    }
    const slice = candles.slice(0, index + 1)
    const gaps = findFairValueGaps(slice)
    const strict = recentInverseFvg(gaps, trendFromSwings(findTjrSwings(slice)), index)
    const inverse = strict ?? (options.allowPermissiveIfvg ? permissiveInverseFvg(gaps, index) : undefined)
    if (inverse === 'bullish' || inverse === 'bearish') {
      return { direction: inverse, via: 'ifvg', candleIndex: index, openTime: candles[index].openTime }
    }
  }
  return undefined
}

/** Última vela contrária antes de um BOS/iFVG confirmado; não aceita OB aleatório. */
export function findConfirmedOrderBlocks(candles: Candle[], lookback = 40): ConfirmedBlock[] {
  const blocks: ConfirmedBlock[] = []
  const start = Math.max(6, candles.length - lookback)
  for (let index = start; index < candles.length; index += 1) {
    const direction = confirmationEventAt(candles, index)
    if (direction !== 'bullish' && direction !== 'bearish') continue
    let sourceIndex: number | undefined
    for (let candidate = index - 1; candidate >= Math.max(0, index - 8); candidate -= 1) {
      const candle = candles[candidate]
      const opposite = direction === 'bullish' ? candle.close < candle.open : candle.close > candle.open
      if (opposite) {
        sourceIndex = candidate
        break
      }
    }
    if (sourceIndex === undefined) continue
    const source = candles[sourceIndex]
    const low = direction === 'bullish' ? source.low : source.open
    const high = direction === 'bullish' ? source.open : source.high
    let invalidatedAt: number | undefined
    for (let later = index + 1; later < candles.length; later += 1) {
      if (
        (direction === 'bullish' && candles[later].close < low)
        || (direction === 'bearish' && candles[later].close > high)
      ) {
        invalidatedAt = later
        break
      }
    }
    blocks.push({
      low,
      high,
      kind: 'order-block',
      direction,
      sourceIndex,
      createdAt: index,
      invalidatedAt,
    })
  }
  return blocks
}

export function activeOrderBlock(
  blocks: ConfirmedBlock[],
  direction: 'bullish' | 'bearish',
): ConfirmedBlock | undefined {
  return blocks.filter((block) => block.direction === direction && block.invalidatedAt === undefined).at(-1)
}

/** OB contrário invalidado muda de polaridade; mantém-se até fechar pela outra margem. */
export function activeBreakerBlock(
  candles: Candle[],
  blocks: ConfirmedBlock[],
  direction: 'bullish' | 'bearish',
): ConfirmedBlock | undefined {
  for (const block of [...blocks].reverse()) {
    if (block.invalidatedAt === undefined || block.direction === direction) continue
    const breakerDirection = block.direction === 'bullish' ? 'bearish' : 'bullish'
    if (breakerDirection !== direction) continue
    const brokenAgain = candles.slice(block.invalidatedAt + 1).some((candle) =>
      direction === 'bullish' ? candle.close < block.low : candle.close > block.high)
    if (!brokenAgain) {
      return { ...block, kind: 'breaker-block', direction }
    }
  }
  return undefined
}

/** Prioridade determinística TJR para a zona de continuação selecionada. */
export function selectContinuationZone(
  gaps: FairValueGap[],
  trend: 'bullish' | 'bearish',
  equilibrium: number | undefined,
  orderBlock?: ConfirmedBlock,
  breakerBlock?: ConfirmedBlock,
): PriceZone | undefined {
  const gap = activeFairValueGap(gaps, trend)
  if (gap) return gap
  if (equilibrium !== undefined) {
    return { low: equilibrium * 0.9995, high: equilibrium * 1.0005, kind: 'equilibrium' }
  }
  if (orderBlock?.direction === trend) return orderBlock
  if (breakerBlock?.direction === trend) return breakerBlock
  return undefined
}

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1)

/** Wick takes level then closes back inside = liquidity sweep. */
export function recentLiquiditySweep(candles: Candle[], swings: SwingPoint[], lookback = 20): Direction | undefined {
  const recent = candles.slice(-lookback)
  const offset = candles.length - lookback
  const relevant = swings.filter((s) => s.index >= offset - 5)

  for (let i = recent.length - 1; i >= 1; i -= 1) {
    const candle = recent[i]
    const highs = relevant.filter((s) => s.type === 'high' && s.index < offset + i)
    for (const swing of highs.slice(-4)) {
      if (candle.high > swing.price && candle.close < swing.price) return 'bearish'
    }
    const lows = relevant.filter((s) => s.type === 'low' && s.index < offset + i)
    for (const swing of lows.slice(-4)) {
      if (candle.low < swing.price && candle.close > swing.price) return 'bullish'
    }
  }
  return undefined
}

/** TJR: sweep só conta se o wick tomar um draw HTF (níveis passados), não um micro-swing. */
export function recentDrawLiquiditySweep(candles: Candle[], drawLevels: number[], lookback = 24): Direction | undefined {
  return recentDrawLiquiditySweepDetailed(
    candles,
    drawLevels.map((price) => ({ price, source: 'swing_1h' as const, label: 'Draw', kind: 'low' as const })),
    lookback,
  )?.direction
}

export type SweepSource = 'asia' | 'london' | 'newyork' | 'prev_day' | 'swing_1h' | 'swing_4h' | 'none'

export type DrawLevel = { price: number; source: SweepSource; label: string; kind: 'high' | 'low' }

export type DrawSweepHit = {
  direction: Direction
  source: SweepSource
  label: string
  price: number
  kind: 'high' | 'low'
  candleIndex: number
  openTime: number
}

/** O sweep mais recente manda; empate fica conservadoramente com o oposto. */
export function resolveControllingDrawHits(
  aligned: DrawSweepHit | undefined,
  opposed: DrawSweepHit | undefined,
): { aligned?: DrawSweepHit; opposed?: DrawSweepHit } {
  if (aligned && (!opposed || aligned.openTime > opposed.openTime)) return { aligned }
  if (opposed) return { opposed }
  return {}
}

/** Opposed existe mas é estritamente mais antigo que o sweep alinhado. */
export function isStaleOpposedSweep(
  aligned?: DrawSweepHit,
  opposed?: DrawSweepHit,
): boolean {
  return Boolean(aligned && opposed && aligned.openTime > opposed.openTime)
}

/** Primeira confirmação alinhada no mesmo bar ou depois do sweep controlador. */
export function firstConfirmationAfterSweep(
  candles: Candle[],
  after: { openTime?: number },
  side: 'long' | 'short',
  options: { allowPermissiveIfvg?: boolean; maxBars?: number } = {},
): ConfirmationEvent | undefined {
  const start = Math.max(3, candles.length - 80)
  let barsAfter = 0
  for (let index = start; index < candles.length; index += 1) {
    if (after.openTime !== undefined && candles[index].openTime < after.openTime) continue
    if (after.openTime !== undefined) {
      barsAfter += 1
      if (options.maxBars !== undefined && barsAfter > options.maxBars) break
    }
    const bos = bosEventAt(candles, index)
    const alignedBos = (side === 'long' && bos === 'bullish') || (side === 'short' && bos === 'bearish')
    if (alignedBos && (bos === 'bullish' || bos === 'bearish')) {
      return { direction: bos, via: 'bos', candleIndex: index, openTime: candles[index].openTime }
    }
    const slice = candles.slice(0, index + 1)
    const gaps = findFairValueGaps(slice)
    const strict = recentInverseFvg(gaps, trendFromSwings(findTjrSwings(slice)), index)
    const inverse = strict ?? (options.allowPermissiveIfvg ? permissiveInverseFvg(gaps, index) : undefined)
    const alignedInverse = (side === 'long' && inverse === 'bullish') || (side === 'short' && inverse === 'bearish')
    if (alignedInverse && (inverse === 'bullish' || inverse === 'bearish')) {
      return { direction: inverse, via: 'ifvg', candleIndex: index, openTime: candles[index].openTime }
    }
  }
  return undefined
}

/** Prioridade: sessões (Ásia→Londres→NY) e dia ant. antes de swings. */
const sourceRank = (source: SweepSource) => {
  if (source === 'asia') return 0
  if (source === 'london') return 1
  if (source === 'prev_day') return 2
  if (source === 'newyork') return 3
  if (source === 'swing_4h') return 4
  if (source === 'swing_1h') return 5
  return 9
}

/** Wick toma nível + close de volta; devolve o draw HTF atingido (para label reactivo). */
export function recentDrawLiquiditySweepDetailed(
  candles: Candle[],
  draws: DrawLevel[],
  lookback = 36,
): DrawSweepHit | undefined {
  if (!draws.length) return undefined
  const ranked = [...draws].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.price - b.price)
  const recent = candles.slice(-lookback)
  const offset = candles.length - recent.length
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const candle = recent[i]
    for (const level of ranked) {
      // High levels: only count as high-raid (bearish opportunity)
      if (level.kind === 'high' && candle.high > level.price && candle.close < level.price) {
        return {
          direction: 'bearish',
          source: level.source,
          label: level.label,
          price: level.price,
          kind: 'high',
          candleIndex: offset + i,
          openTime: candle.openTime,
        }
      }
      // Low levels: only count as low-raid (bullish opportunity)
      if (level.kind === 'low' && candle.low < level.price && candle.close > level.price) {
        return {
          direction: 'bullish',
          source: level.source,
          label: level.label,
          price: level.price,
          kind: 'low',
          candleIndex: offset + i,
          openTime: candle.openTime,
        }
      }
    }
  }
  return undefined
}

/** Sweep contra níveis existentes *antes* da vela candidata (sessão em curso não inclui o pavio do raid). */
export function recentAsOfHtfDrawSweep(
  candles: Candle[],
  extraDraws: DrawLevel[],
  kind: 'high' | 'low',
  lookback = 36,
): DrawSweepHit | undefined {
  const recent = candles.slice(-lookback)
  const offset = candles.length - recent.length
  const swings = findTjrSwings(candles)
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const absIndex = offset + i
    const candle = candles[absIndex]
    const draws: DrawLevel[] = [
      ...sessionLevelsUntil(candles, absIndex).map((line) => ({
        price: line.price,
        source: line.session as SweepSource,
        label: line.title,
        kind: line.kind,
      })),
      ...previousDayLevelsUntil(candles, absIndex).map((line) => ({
        price: line.price,
        source: 'prev_day' as const,
        label: line.title,
        kind: line.kind,
      })),
      ...swings.filter((s) => s.index < absIndex).slice(-6).map((s) => ({
        price: s.price,
        source: 'swing_1h' as const,
        label: s.type === 'high' ? '1h H' : '1h L',
        kind: s.type,
      })),
      ...extraDraws,
    ].filter((draw) => draw.kind === kind)
    const ranked = [...draws].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.price - b.price)
    for (const level of ranked) {
      if (level.kind === 'high' && candle.high > level.price && candle.close < level.price) {
        return {
          direction: 'bearish',
          source: level.source,
          label: level.label,
          price: level.price,
          kind: 'high',
          candleIndex: absIndex,
          openTime: candle.openTime,
        }
      }
      if (level.kind === 'low' && candle.low < level.price && candle.close > level.price) {
        return {
          direction: 'bullish',
          source: level.source,
          label: level.label,
          price: level.price,
          kind: 'low',
          candleIndex: absIndex,
          openTime: candle.openTime,
        }
      }
    }
  }
  return undefined
}

/** Sweep pré-NY (Ásia / Londres / dia ant.) → trade reactivo no open, sem esperar novo raid. */
export function isReactiveSweep(source: SweepSource | undefined, side: 'long' | 'short', direction?: Direction): boolean {
  if (!source || source === 'none') return false
  const pre = source === 'asia' || source === 'london' || source === 'prev_day'
  if (!pre) return false
  if (side === 'long') return direction === 'bullish'
  return direction === 'bearish'
}

export type LtfEntryResult = {
  ready: boolean
  entryPrice?: number
  /** Houve BOS/iFVG 1m contrário (retrace 5m) na janela. */
  retraceSeen: boolean
  /** O sinal contrário negociou dentro da FVG/EQ de continuação selecionada. */
  retraceInZone?: boolean
  /** Sinal de entrada: BOS ou iFVG. */
  entryVia?: 'bos' | 'ifvg'
}
const ltfEntryCache = new WeakMap<Candle[], Map<string, LtfEntryResult>>()

/** BOS ou iFVG no fecho do slice (vídeo TJR: ambos válidos no LTF). */
export function ltfConfirmSignal(
  candles: Candle[],
  options: { allowPermissiveIfvg?: boolean } = {},
): { direction: Direction; via: 'bos' | 'ifvg' } | undefined {
  if (candles.length < 6) return undefined
  const swings = findTjrSwings(candles)
  const bos = breakOfStructure(candles, swings)
  if (bos === 'bullish' || bos === 'bearish') return { direction: bos, via: 'bos' }
  const gaps = findFairValueGaps(candles)
  const trend = trendFromSwings(swings)
  const inverse = recentInverseFvg(gaps, trend, candles.length - 1)
  if (inverse === 'bullish' || inverse === 'bearish') return { direction: inverse, via: 'ifvg' }
  if (!options.allowPermissiveIfvg) return undefined
  const permissive = permissiveInverseFvg(gaps, candles.length - 1)
  return permissive ? { direction: permissive, via: 'ifvg' } : undefined
}

/**
 * TJR step 4: retrace (1m BOS/iFVG contrário) → BOS/iFVG 1m na direção.
 * Devolve o close do candle de entrada (preço a copiar).
 */
export function ltfEntryConfirmation(
  candles1m: Candle[],
  side: 'long' | 'short',
  lookback = 45,
  continuationZone?: PriceZone,
  allowPermissiveIfvg = false,
): LtfEntryResult {
  const zoneKey = continuationZone ? `${continuationZone.low}:${continuationZone.high}` : 'none'
  const cacheKey = `${side}:${lookback}:${zoneKey}:${allowPermissiveIfvg ? 'practical' : 'strict'}`
  const cached = ltfEntryCache.get(candles1m)?.get(cacheKey)
  if (cached) return cached
  if (candles1m.length < 12) return { ready: false, retraceSeen: false }
  const window = candles1m.slice(-lookback)
  let sawRetrace = false
  let retraceInZone = false
  let entryAt: number | undefined
  let entryVia: 'bos' | 'ifvg' | undefined
  for (let end = 6; end <= window.length; end += 1) {
    const signal = ltfConfirmSignal(window.slice(0, end), { allowPermissiveIfvg })
    if (!signal) continue
    const aligned = (side === 'long' && signal.direction === 'bullish') || (side === 'short' && signal.direction === 'bearish')
    const opposite = (side === 'long' && signal.direction === 'bearish') || (side === 'short' && signal.direction === 'bullish')
    if (opposite) {
      const candle = window[end - 1]
      const insideZone = !continuationZone
        || (candle.high >= continuationZone.low && candle.low <= continuationZone.high)
      sawRetrace = insideZone
      retraceInZone = insideZone && Boolean(continuationZone)
      entryAt = undefined
      entryVia = undefined
    }
    if (aligned && sawRetrace) {
      entryAt = end
      entryVia = signal.via
    }
  }
  const ready = entryAt !== undefined && entryAt >= window.length - 5
  const result: LtfEntryResult = !ready || entryAt === undefined
    ? { ready: false, retraceSeen: sawRetrace, retraceInZone }
    : { ready: true, entryPrice: window[entryAt - 1]?.close, retraceSeen: true, retraceInZone, entryVia }
  const entries = ltfEntryCache.get(candles1m) ?? new Map<string, LtfEntryResult>()
  entries.set(cacheKey, result)
  ltfEntryCache.set(candles1m, entries)
  return result
}

/** Candle de confirmação com corpo ≥ 1.2× média = displacement (mudança de order flow). */
export function hasDisplacement(candles: Candle[], lookback = 14): boolean {
  if (candles.length < 3) return false
  const last = candles.at(-1)!
  const body = Math.abs(last.close - last.open)
  const avg = candles
    .slice(-lookback - 1, -1)
    .map((c) => Math.abs(c.close - c.open))
    .reduce((a, b) => a + b, 0) / Math.max(1, Math.min(lookback, candles.length - 1))
  return body >= avg * 1.2
}

/** BOS: body close beyond the most recent swing high (bullish) or low (bearish). */
export function breakOfStructure(candles: Candle[], swings: SwingPoint[]): Direction | undefined {
  const close = candles.at(-1)?.close ?? 0
  const lastHigh = swings.filter((s) => s.type === 'high').at(-1)?.price
  const lastLow = swings.filter((s) => s.type === 'low').at(-1)?.price
  if (lastHigh !== undefined && close > lastHigh) return 'bullish'
  if (lastLow !== undefined && close < lastLow) return 'bearish'
  return undefined
}

/** Inverse FVG: fecho além da fronteira controladora da stack; wick não conta. */
export function recentInverseFvg(
  gaps: FairValueGap[],
  _trend: Direction,
  currentIndex?: number,
): Direction | undefined {
  const recent = findFairValueGapStacks(gaps)
    .filter((stack) =>
      stack.disrespected
      && (currentIndex === undefined || stack.invalidatedAt === currentIndex))
    .at(-1)
  if (!recent) return undefined
  return recent.bullish ? 'bearish' : 'bullish'
}

/** Compatibilidade Prático: qualquer gap individual invalidada no candle atual. */
export function permissiveInverseFvg(
  gaps: FairValueGap[],
  currentIndex: number,
): Direction | undefined {
  const recent = gaps.filter((gap) => gap.invalidatedAt === currentIndex).at(-1)
  if (!recent) return undefined
  return recent.bullish ? 'bearish' : 'bullish'
}

/** 50% between most recent swing low and high in the active leg. */
export function equilibriumPrice(swings: SwingPoint[]): number | undefined {
  const lastHigh = swings.filter((s) => s.type === 'high').at(-1)?.price
  const lastLow = swings.filter((s) => s.type === 'low').at(-1)?.price
  if (lastHigh === undefined || lastLow === undefined) return undefined
  return (lastHigh + lastLow) / 2
}

export function priceInDiscount(price: number, eq: number, trend: Direction) {
  if (trend === 'bullish') return price <= eq
  if (trend === 'bearish') return price >= eq
  return false
}

export function priceInPremium(price: number, eq: number, trend: Direction) {
  if (trend === 'bullish') return price >= eq
  if (trend === 'bearish') return price <= eq
  return false
}

export function activeFairValueGap(gaps: FairValueGap[], trend: Direction): FairValueGap | undefined {
  const valid = gaps.filter((g) => !g.disrespected && ((trend === 'bullish' && g.bullish) || (trend === 'bearish' && !g.bullish)))
  return valid.at(-1)
}

export function priceTouchesZone(price: number, zone: PriceZone, tolerance = 0.0015) {
  const pad = price * tolerance
  return price >= zone.low - pad && price <= zone.high + pad
}

/** Crypto SMT: compare swing structure vs BTC at liquidity (TJR ES/NQ analogue). */
export function smtDivergence(primary: Candle[], reference: Candle[]): Direction | undefined {
  const pSwings = findTjrSwings(primary.slice(-60))
  const rSwings = findTjrSwings(reference.slice(-60))
  const pHighs = pSwings.filter((s) => s.type === 'high').map((s) => s.price)
  const rHighs = rSwings.filter((s) => s.type === 'high').map((s) => s.price)
  const pLows = pSwings.filter((s) => s.type === 'low').map((s) => s.price)
  const rLows = rSwings.filter((s) => s.type === 'low').map((s) => s.price)

  if (pHighs.length >= 2 && rHighs.length >= 2) {
    const pLowerHigh = pHighs.at(-1)! < pHighs.at(-2)!
    const rHigherHigh = rHighs.at(-1)! > rHighs.at(-2)!
    if (pLowerHigh && rHigherHigh) return 'bearish'
    const pHigherHigh = pHighs.at(-1)! > pHighs.at(-2)!
    const rLowerHigh = rHighs.at(-1)! < rHighs.at(-2)!
    if (pHigherHigh && rLowerHigh) return 'bullish'
  }
  if (pLows.length >= 2 && rLows.length >= 2) {
    const pLowerLow = pLows.at(-1)! < pLows.at(-2)!
    const rHigherLow = rLows.at(-1)! > rLows.at(-2)!
    if (pLowerLow && rHigherLow) return 'bullish'
    const pHigherLow = pLows.at(-1)! > pLows.at(-2)!
    const rLowerLow = rLows.at(-1)! < rLows.at(-2)!
    if (pHigherLow && rLowerLow) return 'bearish'
  }
  return undefined
}

const structureSnapshotCache = new WeakMap<Candle[], ReturnType<typeof computeStructureSnapshot>>()

function computeStructureSnapshot(candles: Candle[]) {
  const swings = findTjrSwings(candles)
  const trend = trendFromSwings(swings)
  const gaps = findFairValueGaps(candles)
  const sweep = recentLiquiditySweep(candles, swings)
  const bos = breakOfStructure(candles, swings)
  const inverse = recentInverseFvg(gaps, trend, candles.length - 1)
  const eq = equilibriumPrice(swings)
  const fvg = activeFairValueGap(gaps, trend)
  const blocks = findConfirmedOrderBlocks(candles)
  const blockDirection = trend === 'bullish' || trend === 'bearish' ? trend : undefined
  const orderBlock = blockDirection ? activeOrderBlock(blocks, blockDirection) : undefined
  const breakerBlock = blockDirection ? activeBreakerBlock(candles, blocks, blockDirection) : undefined
  const price = candles.at(-1)?.close ?? 0
  return {
    swings,
    trend,
    gaps,
    sweep,
    bos,
    inverse,
    eq,
    fvg,
    orderBlock,
    breakerBlock,
    price,
    candleIndex: candles.length - 1,
  }
}

export function structureSnapshot(candles: Candle[]) {
  const cached = structureSnapshotCache.get(candles)
  if (cached) return cached
  const value = computeStructureSnapshot(candles)
  structureSnapshotCache.set(candles, value)
  return value
}

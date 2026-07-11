import type { Analysis, Candle, Direction, PlaybookSetup, PriceZone, ScannerRow, Signal, TimeframeStructure } from './types'

const average = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length

function sma(values: number[], period: number) {
  return average(values.slice(-period))
}

function ema(values: number[], period: number) {
  const multiplier = 2 / (period + 1)
  return values.reduce<number[]>((result, value, index) => {
    const previous = result[index - 1] ?? value
    result.push(value * multiplier + previous * (1 - multiplier))
    return result
  }, [])
}

function rsi(closes: number[], period = 14) {
  const changes = closes.slice(-period - 1).slice(1).map((close, index) => close - closes.slice(-period - 1)[index])
  const gains = changes.map((change) => Math.max(change, 0))
  const losses = changes.map((change) => Math.max(-change, 0))
  const averageGain = average(gains)
  const averageLoss = average(losses)
  if (averageLoss === 0) return 100
  return 100 - 100 / (1 + averageGain / averageLoss)
}

function macd(closes: number[]) {
  const fast = ema(closes, 12)
  const slow = ema(closes, 26)
  const line = fast.map((value, index) => value - slow[index])
  const signal = ema(line, 9)
  return { value: line.at(-1) ?? 0, signal: signal.at(-1) ?? 0 }
}

function robustMetrics(candles: Candle[], closes: number[], sma20: number, sma50: number) {
  const trueRanges = candles.slice(-15).slice(1).map((candle, index) => {
    const previousClose = candles.slice(-15)[index].close
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose))
  })
  const atr = average(trueRanges)
  const recent = closes.slice(-20)
  const mean = average(recent)
  const deviation = Math.sqrt(average(recent.map((value) => (value - mean) ** 2)))
  const lower = mean - deviation * 2
  const upper = mean + deviation * 2
  const bollingerPosition = (closes.at(-1)! - lower) / (upper - lower || 1)
  const rsiSeries = closes.slice(-30).map((_, index, values) => index < 14 ? 50 : rsi(values.slice(0, index + 1)))
  const lastRsi = rsiSeries.at(-1) ?? 50
  const recentRsi = rsiSeries.slice(-14)
  const stochasticRsi = ((lastRsi - Math.min(...recentRsi)) / (Math.max(...recentRsi) - Math.min(...recentRsi) || 1)) * 100
  const volumeWindow = candles.slice(-20)
  const totalVolume = volumeWindow.reduce((sum, candle) => sum + candle.volume, 0)
  const vwap = volumeWindow.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * candle.volume, 0) / (totalVolume || 1)
  return { atr, bollingerPosition, stochasticRsi, vwap, trendStrength: Math.abs(sma20 - sma50) / (atr || 1) }
}

function buildSignal(
  price: number,
  rsiValue: number,
  macdValue: number,
  macdSignalValue: number,
  sma20: number,
  sma50: number,
  volumeRatio: number,
  support: number,
  resistance: number,
): Signal {
  const reasons: string[] = []
  let score = 0

  if (price > sma20 && sma20 > sma50) {
    score += 2
    reasons.push('Tendência de curto prazo acima das médias móveis.')
  } else if (price < sma20 && sma20 < sma50) {
    score -= 2
    reasons.push('Tendência de curto prazo abaixo das médias móveis.')
  } else {
    reasons.push('Médias móveis sem alinhamento claro.')
  }

  if (rsiValue >= 45 && rsiValue <= 65) {
    score += 1
    reasons.push('RSI em zona neutra/positiva, sem sobrecompra extrema.')
  } else if (rsiValue > 70) {
    score -= 1
    reasons.push('RSI indica possível sobrecompra.')
  } else if (rsiValue < 30) {
    reasons.push('RSI indica sobrevenda; exige confirmação de reversão.')
  }

  if (macdValue > macdSignalValue) {
    score += 1
    reasons.push('MACD acima da sua linha de sinal.')
  } else {
    score -= 1
    reasons.push('MACD abaixo da sua linha de sinal.')
  }

  if (volumeRatio > 1.2) {
    score += 1
    reasons.push('Volume acima da média recente.')
  } else {
    reasons.push('Volume sem confirmação acima da média.')
  }

  const entry = price
  const stop = support * 0.995
  const target = resistance
  const riskReward = stop < entry && target > entry ? (target - entry) / (entry - stop) : 0
  if (riskReward < 1.5) reasons.push('A relação risco/retorno estimada é fraca.')

  const label = score >= 4 && riskReward >= 1.5 ? 'COMPRAR' : score <= -2 ? 'EVITAR' : 'AGUARDAR'
  return { label, score, reasons, entry, stop, target, riskReward }
}

export function analyse(candles: Candle[], change24h: number): Analysis {
  if (candles.length < 60) throw new Error('Dados históricos insuficientes para análise.')

  const closes = candles.map((candle) => candle.close)
  const volumes = candles.map((candle) => candle.volume)
  const price = closes.at(-1) ?? 0
  const rsiValue = rsi(closes)
  const macdResult = macd(closes)
  const sma20 = sma(closes, 20)
  const sma50 = sma(closes, 50)
  const recent = candles.slice(-40)
  const support = Math.min(...recent.map((candle) => candle.low))
  const resistance = Math.max(...recent.map((candle) => candle.high))
  const volumeRatio = (volumes.at(-1) ?? 0) / average(volumes.slice(-21, -1))

  const signal = buildSignal(price, rsiValue, macdResult.value, macdResult.signal, sma20, sma50, volumeRatio, support, resistance)
  const robust = robustMetrics(candles, closes, sma20, sma50)

  return {
    price,
    change24h,
    rsi: rsiValue,
    macd: macdResult.value,
    macdSignal: macdResult.signal,
    sma20,
    sma50,
    support,
    resistance,
    volumeRatio,
    signal,
    states: {
      rsi: rsiValue > 70 ? 'negative' : rsiValue >= 45 ? 'positive' : rsiValue < 30 ? 'neutral' : 'neutral',
      macd: macdResult.value > macdResult.signal ? 'positive' : 'negative',
      trend: price > sma20 && sma20 > sma50 ? 'positive' : price < sma20 && sma20 < sma50 ? 'negative' : 'neutral',
      volume: volumeRatio > 1.2 ? 'positive' : volumeRatio < 0.8 ? 'negative' : 'neutral',
      riskReward: (signal.riskReward ?? 0) >= 1.5 ? 'positive' : 'negative',
    },
    robust,
  }
}

export function toScannerRow(symbol: string, analysis: Analysis): ScannerRow {
  return {
    symbol,
    price: analysis.price,
    change24h: analysis.change24h,
    score: analysis.signal.score,
    label: analysis.signal.label,
    rsi: analysis.rsi,
    volumeRatio: analysis.volumeRatio,
    riskReward: analysis.signal.riskReward ?? 0,
  }
}

function findSwings(candles: Candle[]) {
  const swings: { high: number; low: number }[] = []
  for (let index = 1; index < candles.length - 1; index += 1) {
    const previous = candles[index - 1]
    const current = candles[index]
    const next = candles[index + 1]
    if (current.high > previous.high && current.high > next.high) swings.push({ high: current.high, low: Number.NaN })
    if (current.low < previous.low && current.low < next.low) swings.push({ high: Number.NaN, low: current.low })
  }
  return swings.slice(-12)
}

function directionFromSwings(candles: Candle[], swings: { high: number; low: number }[]): Direction {
  const highs = swings.filter((swing) => Number.isFinite(swing.high)).map((swing) => swing.high)
  const lows = swings.filter((swing) => Number.isFinite(swing.low)).map((swing) => swing.low)
  if (highs.length < 2 || lows.length < 2) return 'neutral'
  const higherHigh = highs.at(-1)! > highs.at(-2)!
  const higherLow = lows.at(-1)! > lows.at(-2)!
  const lowerHigh = highs.at(-1)! < highs.at(-2)!
  const lowerLow = lows.at(-1)! < lows.at(-2)!
  if (higherHigh && higherLow) return 'bullish'
  if (lowerHigh && lowerLow) return 'bearish'
  return (candles.at(-1)?.close ?? 0) >= sma(candles.map((candle) => candle.close), 20) ? 'bullish' : 'bearish'
}

function recentFairValueGap(candles: Candle[]): PriceZone | undefined {
  for (let index = candles.length - 1; index >= Math.max(2, candles.length - 30); index -= 1) {
    const first = candles[index - 2]
    const third = candles[index]
    if (third.low > first.high) return { low: first.high, high: third.low, kind: 'fair-value-gap' }
    if (third.high < first.low) return { low: third.high, high: first.low, kind: 'fair-value-gap' }
  }
  return undefined
}

function recentOrderBlock(candles: Candle[], direction: Direction): PriceZone | undefined {
  for (let index = candles.length - 2; index >= Math.max(0, candles.length - 20); index -= 1) {
    const candle = candles[index]
    if (direction === 'bullish' && candle.close < candle.open) return { low: candle.low, high: candle.open, kind: 'order-block' }
    if (direction === 'bearish' && candle.close > candle.open) return { low: candle.open, high: candle.high, kind: 'order-block' }
  }
  return undefined
}

function balancedRange(candles: Candle[]): PriceZone | undefined {
  let bullish: PriceZone | undefined
  let bearish: PriceZone | undefined
  for (let index = candles.length - 1; index >= Math.max(2, candles.length - 35); index -= 1) {
    const first = candles[index - 2]
    const third = candles[index]
    if (third.low > first.high && !bullish) bullish = { low: first.high, high: third.low, kind: 'fair-value-gap' }
    if (third.high < first.low && !bearish) bearish = { low: third.high, high: first.low, kind: 'fair-value-gap' }
    if (bullish && bearish) {
      const low = Math.max(bullish.low, bearish.low)
      const high = Math.min(bullish.high, bearish.high)
      if (low <= high) return { low, high, kind: 'balanced-range' }
    }
  }
  return undefined
}

function utcSessionRange(candles: Candle[]): PriceZone | undefined {
  const latest = candles.at(-1)
  if (!latest) return undefined
  const day = new Date(latest.openTime).toISOString().slice(0, 10)
  const session = candles.filter((candle) => new Date(candle.openTime).toISOString().slice(0, 10) === day)
  if (session.length === 0) return undefined
  return { low: Math.min(...session.map((candle) => candle.low)), high: Math.max(...session.map((candle) => candle.high)), kind: 'session-range' }
}

export function structureFor(candles: Candle[]): TimeframeStructure {
  const swings = findSwings(candles)
  const highs = swings.filter((swing) => Number.isFinite(swing.high)).map((swing) => swing.high)
  const lows = swings.filter((swing) => Number.isFinite(swing.low)).map((swing) => swing.low)
  const close = candles.at(-1)?.close ?? 0
  const lastHigh = highs.at(-1)
  const lastLow = lows.at(-1)
  const priorHigh = highs.at(-2)
  const priorLow = lows.at(-2)
  const direction = directionFromSwings(candles, swings)
  const breakOfStructure = (direction === 'bullish' && priorHigh !== undefined && close > priorHigh)
    || (direction === 'bearish' && priorLow !== undefined && close < priorLow)
  const lastCandle = candles.at(-1)
  const sweep = lastCandle && lastHigh !== undefined && lastCandle.high > lastHigh && close < lastHigh
    ? 'bearish'
    : lastCandle && lastLow !== undefined && lastCandle.low < lastLow && close > lastLow
      ? 'bullish'
      : undefined
  const recent = candles.slice(-40)
  const rangeHigh = Math.max(...recent.map((candle) => candle.high))
  const rangeLow = Math.min(...recent.map((candle) => candle.low))
  const middle = (rangeHigh + rangeLow) / 2
  const orderBlock = recentOrderBlock(candles, direction)
  const fairValueGap = recentFairValueGap(candles)
  const breakerBlock = orderBlock && ((direction === 'bullish' && close < orderBlock.low) || (direction === 'bearish' && close > orderBlock.high))
    ? { ...orderBlock, kind: 'breaker-block' as const }
    : undefined
  return {
    direction,
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    breakOfStructure,
    sweep,
    fairValueGap,
    equilibrium: { low: middle * 0.999, high: middle * 1.001, kind: 'equilibrium' },
    orderBlock,
    breakerBlock,
    balancedRange: balancedRange(candles),
    sessionRange: utcSessionRange(candles),
  }
}

const isDirectional = (value: Direction, direction: Direction) => value === direction

function recentReplayOutcome(candles: Candle[], direction: Direction): 'ALVO' | 'INVALIDADA' | 'PENDENTE' {
  if (direction === 'neutral' || candles.length < 70) return 'PENDENTE'
  const entryIndex = candles.length - 25
  const entry = candles[entryIndex].close
  const prior = candles.slice(entryIndex - 20, entryIndex)
  const invalidation = direction === 'bullish'
    ? Math.min(...prior.map((candle) => candle.low))
    : Math.max(...prior.map((candle) => candle.high))
  const risk = Math.abs(entry - invalidation)
  if (risk === 0) return 'PENDENTE'
  const target = direction === 'bullish' ? entry + risk * 1.5 : entry - risk * 1.5
  for (const candle of candles.slice(entryIndex + 1)) {
    if (direction === 'bullish' && candle.low <= invalidation) return 'INVALIDADA'
    if (direction === 'bearish' && candle.high >= invalidation) return 'INVALIDADA'
    if (direction === 'bullish' && candle.high >= target) return 'ALVO'
    if (direction === 'bearish' && candle.low <= target) return 'ALVO'
  }
  return 'PENDENTE'
}

export function createPlaybookSetup(data: Record<'4h' | '1h' | '15m' | '5m', Candle[]>): PlaybookSetup {
  const structures = {
    '4h': structureFor(data['4h']),
    '1h': structureFor(data['1h']),
    '15m': structureFor(data['15m']),
    '5m': structureFor(data['5m']),
  }
  const bias = structures['4h'].direction
  const aligned = bias !== 'neutral' && isDirectional(structures['1h'].direction, bias)
  const executionInterval = aligned ? '5m' : '15m'
  const execution = structures[executionInterval]
  const highTimeframeZone = structures['1h'].fairValueGap ?? structures['1h'].orderBlock ?? structures['1h'].balancedRange ?? structures['4h'].fairValueGap ?? structures['1h'].equilibrium
  const highTimeframeTrigger = isDirectional(structures['4h'].sweep ?? 'neutral', bias)
    || isDirectional(structures['1h'].sweep ?? 'neutral', bias)
    || highTimeframeZone !== undefined
  const bosConfirmed = isDirectional(execution.direction, bias) && execution.breakOfStructure
  const lowerZone = execution.fairValueGap ?? execution.orderBlock ?? execution.balancedRange ?? execution.equilibrium
  const currentPrice = data[executionInterval].at(-1)?.close ?? 0
  const reactionConfirmed = lowerZone !== undefined
    && currentPrice >= lowerZone.low && currentPrice <= lowerZone.high
    && isDirectional(execution.direction, bias)
  const entry = currentPrice
  const invalidation = bias === 'bullish'
    ? Math.min(lowerZone?.low ?? entry, execution.lastSwingLow ?? entry)
    : Math.max(lowerZone?.high ?? entry, execution.lastSwingHigh ?? entry)
  const target = bias === 'bullish' ? structures['1h'].lastSwingHigh : structures['1h'].lastSwingLow
  const riskReward = target !== undefined && invalidation !== entry
    ? Math.abs(target - entry) / Math.abs(entry - invalidation)
    : undefined
  const complete = bias !== 'neutral' && highTimeframeTrigger && bosConfirmed && reactionConfirmed && (riskReward ?? 0) >= 1.5
  const blocked = bias === 'neutral' || !highTimeframeTrigger
  return {
    status: complete ? 'CONFIRMADA' : blocked ? 'BLOQUEADA' : 'A_AGUARDAR',
    bias,
    executionInterval,
    structures,
    checklist: [
      { label: 'Bias 4h', complete: bias !== 'neutral', note: `Estrutura ${bias === 'bullish' ? 'altista' : bias === 'bearish' ? 'baixista' : 'indefinida'}.` },
      { label: 'Confluência de alto timeframe', complete: highTimeframeTrigger, note: 'Liquidity sweep ou zona FVG/equilíbrio em 4h/1h.' },
      { label: `Break of structure ${executionInterval}`, complete: bosConfirmed, note: 'Confirmação no timeframe de execução.' },
      { label: 'Reação na zona', complete: reactionConfirmed, note: 'Preço regressa à zona e mantém direção.' },
      { label: 'Risco/retorno ≥ 1,5', complete: (riskReward ?? 0) >= 1.5, note: riskReward ? `${riskReward.toFixed(2)}× estimado.` : 'Aguardar níveis válidos.' },
    ],
    entry,
    invalidation,
    target,
    riskReward,
    zones: [
      structures['4h'].fairValueGap,
      structures['4h'].orderBlock,
      structures['1h'].fairValueGap,
      structures['1h'].orderBlock,
      structures['1h'].breakerBlock,
      structures['1h'].balancedRange,
      execution.fairValueGap,
      execution.orderBlock,
      execution.breakerBlock,
      execution.balancedRange,
      execution.sessionRange,
    ].filter((zone): zone is PriceZone => zone !== undefined),
    historicalOutcome: recentReplayOutcome(data[executionInterval], bias),
  }
}

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export type Candle = {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type SignalLabel = 'COMPRAR' | 'AGUARDAR' | 'EVITAR'
export type IndicatorState = 'positive' | 'negative' | 'neutral'

export type Signal = {
  label: SignalLabel
  score: number
  reasons: string[]
  entry?: number
  stop?: number
  target?: number
  riskReward?: number
}

export type Analysis = {
  price: number
  change24h: number
  rsi: number
  macd: number
  macdSignal: number
  sma20: number
  sma50: number
  support: number
  resistance: number
  volumeRatio: number
  signal: Signal
  states: {
    rsi: IndicatorState
    macd: IndicatorState
    trend: IndicatorState
    volume: IndicatorState
    riskReward: IndicatorState
  }
  robust: {
    atr: number
    bollingerPosition: number
    stochasticRsi: number
    vwap: number
    trendStrength: number
  }
}

export type MarketTicker = {
  symbol: string
  quoteVolume: number
  priceChangePercent: number
}

export type MarketAvailability = 'confirmed-by-user' | 'globally-listed' | 'excluded-for-portugal'

export type ConfirmedCoin = {
  ticker: string
  spotSymbol: string
  confirmedAt: string
}

export type ScannerRow = {
  symbol: string
  price: number
  change24h: number
  score: number
  label: SignalLabel
  rsi: number
  volumeRatio: number
  riskReward: number
}

export type Direction = 'bullish' | 'bearish' | 'neutral'
export type SetupStatus = 'CONFIRMADA' | 'A_AGUARDAR' | 'BLOQUEADA'

export type PriceZone = {
  low: number
  high: number
  kind: 'liquidity-sweep' | 'fair-value-gap' | 'equilibrium' | 'order-block' | 'breaker-block' | 'balanced-range' | 'session-range'
}

export type TimeframeStructure = {
  direction: Direction
  lastSwingHigh?: number
  lastSwingLow?: number
  breakOfStructure: boolean
  sweep?: Direction
  fairValueGap?: PriceZone
  equilibrium?: PriceZone
  orderBlock?: PriceZone
  breakerBlock?: PriceZone
  balancedRange?: PriceZone
  sessionRange?: PriceZone
}

export type PlaybookSetup = {
  status: SetupStatus
  bias: Direction
  executionInterval: '5m' | '15m'
  structures: Record<'4h' | '1h' | '5m' | '15m', TimeframeStructure>
  checklist: { label: string; complete: boolean; note: string }[]
  entry?: number
  invalidation?: number
  target?: number
  riskReward?: number
  zones: PriceZone[]
  historicalOutcome?: 'ALVO' | 'INVALIDADA' | 'PENDENTE'
}

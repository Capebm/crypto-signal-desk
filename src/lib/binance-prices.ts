/** Binance copy/display formatting — testable, tick-aware. */

export function roundForBinance(value: number): number {
  if (value >= 1) return Math.round(value * 100) / 100
  if (value >= 0.1) return Math.round(value * 1000) / 1000
  if (value >= 0.01) return Math.round(value * 10000) / 10000
  if (value >= 0.001) return Math.round(value * 1_000_000) / 1_000_000
  return Math.round(value * 100_000_000) / 100_000_000
}

export function priceTickSize(value: number): number {
  if (value >= 1) return 0.01
  if (value >= 0.1) return 0.001
  if (value >= 0.01) return 0.0001
  if (value >= 0.001) return 0.000001
  return 0.00000001
}

/** Valor para colar na Binance (ponto decimal). */
export function binancePriceCopy(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const rounded = roundForBinance(value)
  if (rounded >= 1) return rounded.toFixed(2)
  if (rounded >= 0.1) return rounded.toFixed(3)
  if (rounded >= 0.01) return rounded.toFixed(4)
  if (rounded >= 0.001) return rounded.toFixed(6)
  return rounded.toFixed(8)
}

/** SL limit must be strictly below trigger on Binance OCO. */
export function binanceStopLimitCopy(stop?: number): string {
  if (stop === undefined || !Number.isFinite(stop)) return '—'
  const tick = priceTickSize(stop)
  let limit = stop - tick
  const triggerStr = binancePriceCopy(stop)
  while (limit > 0 && binancePriceCopy(limit) >= triggerStr) {
    limit -= tick
  }
  return binancePriceCopy(limit)
}

export function binancePriceDisplay(value?: number): string {
  return binancePriceCopy(value).replace('.', ',')
}

export function stopLimitBelowTrigger(stop: number): boolean {
  const trigger = binancePriceCopy(stop)
  const limit = binanceStopLimitCopy(stop)
  if (trigger === '—' || limit === '—') return false
  return Number.parseFloat(limit) < Number.parseFloat(trigger)
}

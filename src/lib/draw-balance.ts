/**
 * Equilíbrio de draws («cookies», TJR · daily bias): quantos draws ainda por tomar há acima e
 * abaixo do preço e a que distância está o mais próximo. Só é gravado no sinal para medir —
 * não entra em nenhuma regra do motor.
 */
export type DrawBalance = {
  above: number
  below: number
  /** Distância ao draw mais próximo, em % do preço. */
  nearAbovePct?: number
  nearBelowPct?: number
}

type Level = { price: number; kind: 'high' | 'low' }

/** Níveis a menos de 0,05% um do outro contam como um só draw. */
const SAME_LEVEL = 0.0005

const distinct = (prices: number[], reference: number) => {
  const sorted = [...prices].sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference))
  const kept: number[] = []
  for (const price of sorted) {
    if (!kept.some((other) => Math.abs(other - price) / reference < SAME_LEVEL)) kept.push(price)
  }
  return kept
}

const pct = (value: number) => Math.round(value * 10_000) / 100

/** Highs acima e lows abaixo do preço; os do lado errado já foram tomados e não contam. */
export function computeDrawBalance(price: number, levels: Level[]): DrawBalance | undefined {
  if (!(price > 0)) return undefined
  const above = distinct(levels.filter((l) => l.kind === 'high' && l.price > price).map((l) => l.price), price)
  const below = distinct(levels.filter((l) => l.kind === 'low' && l.price < price).map((l) => l.price), price)
  return {
    above: above.length,
    below: below.length,
    nearAbovePct: above.length ? pct((above[0] - price) / price) : undefined,
    nearBelowPct: below.length ? pct((price - below[0]) / price) : undefined,
  }
}

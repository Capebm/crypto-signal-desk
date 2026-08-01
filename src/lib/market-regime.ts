import type { Direction } from './types'

export type MarketRegime = {
  btcBias: Direction
  longCandidates: number
  highSweepHeavy: number
  total: number
  label: string
  tone: 'ok' | 'caution' | 'hostile'
  hint: string
}

type RowLike = {
  opposedSweep?: boolean
  action?: string
  bias?: Direction
}

/** Regime do scan — BTC bias + peso de sweeps de HIGH vs candidatos long. */
export function computeMarketRegime(
  rows: RowLike[],
  btcBias: Direction = 'neutral',
): MarketRegime {
  const total = rows.length
  const longCandidates = rows.filter((r) => r.action === 'COMPRAR').length
  const highSweepHeavy = rows.filter((r) => r.opposedSweep).length
  const highPct = total > 0 ? highSweepHeavy / total : 0

  let tone: MarketRegime['tone'] = 'ok'
  let label = 'Regime neutro'
  let hint = 'Scan ok — filtra por score e checklist.'

  if (btcBias === 'bearish' && highPct >= 0.2) {
    tone = 'hostile'
    label = 'Regime hostil a longs'
    hint = 'BTC baixista + muitos sweeps de HIGH. Spot: preferir ESPERAR.'
  } else if (btcBias === 'bearish' || highPct >= 0.25) {
    tone = 'caution'
    label = 'Regime cauteloso'
    hint = btcBias === 'bearish'
      ? 'BTC baixista — longs só com setup clássico (sem malha).'
      : 'Muitos sweeps de HIGH no universo — Spot long filtrado.'
  } else if (btcBias === 'bullish' && longCandidates > 0) {
    tone = 'ok'
    label = 'Regime favorável a longs'
    hint = 'BTC altista — foco em COMPRAR JÁ / Aguardar com score alto.'
  }

  return { btcBias, longCandidates, highSweepHeavy, total, label, tone, hint }
}

export function biasLabel(bias: Direction): string {
  if (bias === 'bullish') return 'Altista'
  if (bias === 'bearish') return 'Baixista'
  return 'Neutro'
}

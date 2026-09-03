import { structureSnapshot } from './tjr-structure'
import { computeEsNqLiquiditySmt, type EsNqLiquiditySmt } from './t212-es-nq-smt'
import type { Candle, Direction } from './types'
import { instrumentById, type T212Instrument } from './yahoo-market'

/** Índices/futuros US: gate ES↔NQ + retrace 1m estrito + janela 09:30–10:30 ET. */
const ES_NQ_GATE_IDS = new Set(['us500', 'tech100', 'us30', 'es', 'nq', 'ym'])

export function t212NeedsEsNqGate(instrument: T212Instrument): boolean {
  return ES_NQ_GATE_IDS.has(instrument.id)
}

/** Alias: playbook US índice (mesmos ids). */
export const t212IsUsIndexPlaybook = t212NeedsEsNqGate

export type EsNqAlignment = {
  aligned: boolean
  esTrend: Direction
  nqTrend: Direction
  note: string
}

export type EsNqContext = EsNqAlignment & {
  smt: EsNqLiquiditySmt
}

/** Ambos bullish ou ambos bearish. Neutral / divergência = não alinhado. */
export function trendsEsNqAligned(esTrend: Direction, nqTrend: Direction): boolean {
  return (esTrend === 'bullish' && nqTrend === 'bullish')
    || (esTrend === 'bearish' && nqTrend === 'bearish')
}

/** Tendência comparada no 5m; contexto informativo, não é SMT de liquidez. */
export function computeEsNqAlignment(es5m: Candle[], nq5m: Candle[]): EsNqAlignment {
  const esTrend = structureSnapshot(es5m).trend
  const nqTrend = structureSnapshot(nq5m).trend
  const aligned = trendsEsNqAligned(esTrend, nqTrend)
  return {
    aligned,
    esTrend,
    nqTrend,
    note: aligned
      ? `ES+NQ 5m ${esTrend}`
      : `ES 5m ${esTrend} ≠ NQ 5m ${nqTrend} — tendência divergente`,
  }
}

export function computeEsNqContext(
  es5m: Candle[],
  nq5m: Candle[],
  options?: Parameters<typeof computeEsNqLiquiditySmt>[2],
): EsNqContext {
  return {
    ...computeEsNqAlignment(es5m, nq5m),
    smt: computeEsNqLiquiditySmt(es5m, nq5m, options),
  }
}

export function t212EsInstrument(): T212Instrument {
  return instrumentById('es')!
}

export function t212NqInstrument(): T212Instrument {
  return instrumentById('nq')!
}

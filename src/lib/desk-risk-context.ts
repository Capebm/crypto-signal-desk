import { dayId, pnlForDay } from './journal/journal-stats'
import { getClosedTrades, loadJournalStore } from './journal/trade-store'
import { loadOpenPosition } from './open-position-store'
import { readRiskSettings, riskWarnings, type RiskWarning } from './risk-rules'
import { loadT212OpenPosition } from './t212-open-position-store'
import type { InstrumentKind } from './trade-levels'

export type DeskRiskSnapshot = {
  openPositions: number
  todayPnl: number
}

/** Posições abertas (Spot guardada + T212 guardada/ledger) e PnL realizado hoje. */
export function readDeskRiskSnapshot(now = new Date()): DeskRiskSnapshot {
  let openPositions = 0
  let todayPnl = 0
  try {
    const t212Ledger = loadJournalStore().t212OpenExecutions?.length ?? 0
    openPositions = (loadOpenPosition() ? 1 : 0) + Math.max(loadT212OpenPosition() ? 1 : 0, t212Ledger)
    todayPnl = pnlForDay(getClosedTrades(), dayId(now.getTime())).pnl
  } catch {
    /* sem dados locais → sem avisos de posições/limite */
  }
  return { openPositions, todayPnl }
}

export function warningsFor(
  venue: 'spot' | 't212',
  instrumentKind: InstrumentKind,
  entry: number | undefined,
  snapshot: DeskRiskSnapshot,
  at = new Date(),
  symbol?: string,
): RiskWarning[] {
  return riskWarnings({ at, venue, instrumentKind, entry, symbol, settings: readRiskSettings(), ...snapshot })
}

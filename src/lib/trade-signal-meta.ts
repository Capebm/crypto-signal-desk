import type { RiskProfile } from './risk-profile'
import type { SessionWindow } from './trading-session'
import type { TpMode } from './tp-mode'

/** Snapshot do setup no momento da entrada — para aprender no Diário. */
export type TradeSignalMeta = {
  score: number
  session: SessionWindow
  sessionBadge?: string
  riskProfile: RiskProfile
  tpMode: TpMode
  softOpposed?: boolean
  riskyHighLong?: boolean
  opposedSweep?: boolean
  wideNet?: boolean
  allowHighSweepLong?: boolean
}

export function signalMetaLabel(meta: TradeSignalMeta): string {
  const flags: string[] = []
  if (meta.softOpposed) flags.push('só malha')
  if (meta.riskyHighLong) flags.push('H arriscado')
  if (meta.wideNet) flags.push('malha')
  const flag = flags.length ? ` · ${flags.join(', ')}` : ''
  return `${meta.score}/100 · ${meta.riskProfile} · ${meta.tpMode}${flag}`
}

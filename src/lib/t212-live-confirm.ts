import type { TjrDecision } from './tjr-engine'
import type { Candle } from './types'

type LtfPack = {
  '1m': Candle[]
  '5m': Candle[]
}

/** Impede um AGORA quando o feed não tem um candle 1m próprio e recente. */
export function requireLiveConfirmationForStaleLtf(
  decision: TjrDecision,
  data: LtfPack,
  now = Date.now(),
): TjrDecision {
  const latest1m = data['1m'].at(-1)
  const ageMinutes = latest1m ? Math.max(0, (now - latest1m.openTime) / 60_000) : Number.POSITIVE_INFINITY
  const fiveMinuteFallback = data['1m'] === data['5m']
  const stale = fiveMinuteFallback || ageMinutes > 3
  if (!stale || decision.entryTiming !== 'AGORA' || decision.positionGuidance !== 'ENTRAR_AGORA') {
    return { ...decision, ltfDataAgeMinutes: ageMinutes, ltfFeedFresh: !stale }
  }

  const ageLabel = Number.isFinite(ageMinutes) ? `${Math.round(ageMinutes)} min` : 'sem timestamp'
  return {
    ...decision,
    entryTiming: 'RETRACE',
    positionGuidance: 'AGUARDAR_ENTRADA',
    setupStatus: 'A_AGUARDAR',
    liveConfirmationRequired: true,
    ltfDataAgeMinutes: ageMinutes,
    ltfFeedFresh: false,
    reasons: [`Dados 1m não-live (${fiveMinuteFallback ? 'fallback 5m' : ageLabel}) — confirma 5m+1m no T212.`, ...decision.reasons],
    checklist: [
      ...decision.checklist,
      {
        label: 'Dados LTF live',
        complete: false,
        note: `Feed ${fiveMinuteFallback ? 'sem 1m real' : `atrasado ~${ageLabel}`} — confirmação visual obrigatória.`,
      },
    ],
  }
}

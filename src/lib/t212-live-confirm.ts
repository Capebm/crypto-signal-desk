import type { TjrDecision } from './tjr-engine'
import type { Candle } from './types'

const fmtPrint = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value >= 100) return value.toFixed(2)
  if (value >= 1) return value.toFixed(3)
  if (value >= 0.01) return value.toFixed(4)
  return value.toFixed(6)
}

/** Texto a colar no Claude junto com os dois prints T212 (5m + 1m). */
export function buildT212LivePrintPaste(input: {
  ticker: string
  sideLabel: 'Buy' | 'Sell'
  entry?: number
  stop?: number
  target?: number
  stakeEur: number
  livePrice?: number
}): string {
  const live = input.livePrice !== undefined && Number.isFinite(input.livePrice) && input.livePrice > 0
    ? fmtPrint(input.livePrice)
    : '[copia o last da T212]'
  return [
    `Lado: ${input.sideLabel === 'Sell' ? 'SHORT (Sell)' : 'LONG (Buy)'}`,
    `Ticker T212: ${input.ticker}`,
    `Entrada desk: ${fmtPrint(input.entry)}`,
    `Stop: ${fmtPrint(input.stop)}`,
    `TP: ${fmtPrint(input.target)}`,
    `Stake: ${input.stakeEur} €`,
    `Preço live T212: ${live}`,
    'Prints: 5m + 1m da conta CFD, depois do close. Ignorar a vela da extrema direita.',
  ].join('\n')
}

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

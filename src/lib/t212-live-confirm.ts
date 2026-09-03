import type { TjrDecision } from './tjr-engine'
import type { Candle } from './types'

export const fmtPrint = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value >= 100) return value.toFixed(2)
  if (value >= 1) return value.toFixed(3)
  if (value >= 0.01) return value.toFixed(4)
  return value.toFixed(6)
}

export type T212LivePrintInput = {
  ticker: string
  sideLabel: 'Buy' | 'Sell'
  entry?: number
  stop?: number
  target?: number
  stakeEur: number
  livePrice?: number
}

/** Texto a colar no Claude com o pack do desk + fotos T212. */
export function buildT212LivePrintPaste(input: T212LivePrintInput): string {
  const live = input.livePrice !== undefined && Number.isFinite(input.livePrice) && input.livePrice > 0
    ? fmtPrint(input.livePrice)
    : '[copia o last da T212]'
  const side = input.sideLabel === 'Sell' ? 'SHORT (Sell)' : 'LONG (Buy)'
  return [
    '# CONFIRMAR LIVE — checker TJR + Trading 212 CFD',
    'Não és trader. Default = NO. Não inventas setups.',
    '',
    '## A T212 NÃO TEM isto — nunca peças',
    '- Desenhos: BOS, iFVG, FVG, swings, linhas, zonas. Lê candles em bruto.',
    '- Seletor 5m/1m como no desk. 1D/1W/1M/3M na T212 é o ALCANCE do gráfico, não o tamanho da vela.',
    '- Não digas "já entrou neste setup" só porque a T212 mostra uma posição BUY/SELL — pode ser outro trade.',
    '- Não peças para esperar o fecho :00. Avalia o ecrã agora.',
    '',
    '## Ordem das imagens (fixa)',
    '1. Pack do desk (botão da app): dois painéis já rotulados DESK 5m e DESK 1m. NÃO é a T212. Pode estar atrasado. Serve para níveis e hipótese de estrutura.',
    '2. Foto T212 #1 = sempre 5m (o utilizador garante).',
    '3. Foto T212 #2 = sempre 1m (o utilizador garante).',
    '',
    '## Como julgar',
    '- Estrutura: close visível acima/abaixo de um swing nas candles. Sem caixas desenhadas.',
    '- Preço live = Bid/Ask da T212 (Buy se long, Sell se short).',
    '- Live tem de estar entre Stop e TP. Senão NO.',
    '- R:R live = |TP − live| / |live − Stop|. Se < 1.0 → NO.',
    '- Desk atrasado ≠ prova live. A prova live são as fotos T212.',
    '',
    '## Resposta (só isto)',
    'VEREDICTO: YES|NO',
    '5m: …',
    '1m retrace: …',
    '1m BOS/iFVG: …',
    'Preço live: … · janela … · DENTRO|FORA',
    'R:R live: …',
    'Ticker OK: …',
    'Falta: … (só o que o ecrã não mostra; nunca peças desenhos T212)',
    '',
    '## Dados deste pack',
    `Lado: ${side}`,
    `Ticker T212: ${input.ticker}`,
    `Entrada desk: ${fmtPrint(input.entry)}`,
    `Stop: ${fmtPrint(input.stop)}`,
    `TP: ${fmtPrint(input.target)}`,
    `Stake: ${input.stakeEur} €`,
    `Preço live T212: ${live}`,
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

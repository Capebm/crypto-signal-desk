import { evaluateTjrFull, type TjrDecision } from './tjr-engine'
import type { TpMode } from './tp-mode'
import type { RiskProfile } from './risk-profile'
import type { Candle } from './types'

export type PositionAdvice = 'SAIR' | 'REALIZAR' | 'MANTER' | 'COMPRAR_MAIS'

export type PositionSide = 'long' | 'short'

export type OpenPositionInput = {
  symbol: string
  entryPrice: number
  quantity?: number
  userStop?: number
  userTarget?: number
  /** Spot = long. CFD T212 pode ser short. */
  side?: PositionSide
}

export type PositionAdviceResult = {
  advice: PositionAdvice
  label: string
  summary: string
  reasons: string[]
  currentPrice: number
  pnlPct: number
  pnlUsdc?: number
  riskR: number
  decision: TjrDecision
  levels: { stop?: number; target?: number; entry?: number }
  /** Stop/alvo do OCO do utilizador (não recalculados pelo motor). */
  usingEntryOco: boolean
}

const adviceLabel: Record<PositionAdvice, string> = {
  SAIR: 'SAIR da posição',
  REALIZAR: 'REALIZAR lucro (parcial ou total)',
  MANTER: 'MANTER — deixa correr com stop',
  COMPRAR_MAIS: 'COMPRAR MAIS (só se tiveres margem)',
}

export function adviseOpenPosition(
  input: OpenPositionInput,
  currentPrice: number,
  decision: TjrDecision,
): PositionAdviceResult {
  const side: PositionSide = input.side ?? 'long'
  const short = side === 'short'
  const { entryPrice, quantity, userStop, userTarget } = input
  const invalidUserStop = userStop !== undefined
    && (short ? userStop <= entryPrice : userStop >= entryPrice)
  const invalidUserTarget = userTarget !== undefined
    && (short ? userTarget >= entryPrice : userTarget <= entryPrice)
  const structuralStop = decision.stop !== undefined
    && (short ? decision.stop > entryPrice : decision.stop < entryPrice)
    ? decision.stop
    : undefined
  const structuralTarget = decision.target !== undefined
    && (short ? decision.target < entryPrice : decision.target > entryPrice)
    ? decision.target
    : undefined
  const usingEntryOco = Boolean(
    !invalidUserStop && userStop !== undefined && !invalidUserTarget && userTarget !== undefined,
  )
  const stop = !invalidUserStop && userStop !== undefined ? userStop : structuralStop
  const target = !invalidUserTarget && userTarget !== undefined
    ? userTarget
    : structuralTarget
  const riskPerUnit = stop !== undefined ? Math.abs(entryPrice - stop) : entryPrice * 0.035
  const pnlPct = entryPrice > 0
    ? (short
      ? ((entryPrice - currentPrice) / entryPrice) * 100
      : ((currentPrice - entryPrice) / entryPrice) * 100)
    : 0
  const pnlUsdc = quantity !== undefined
    ? (short ? (entryPrice - currentPrice) : (currentPrice - entryPrice)) * quantity
    : undefined
  const riskR = riskPerUnit > 0
    ? (short ? (entryPrice - currentPrice) : (currentPrice - entryPrice)) / riskPerUnit
    : 0

  const stopHit = stop !== undefined && (short ? currentPrice >= stop : currentPrice <= stop)
  const targetHit = target !== undefined && (short ? currentPrice <= target : currentPrice >= target)
  const nearTarget = target !== undefined
    && (short
      ? entryPrice > target && (entryPrice - currentPrice) / (entryPrice - target) >= 0.85
      : entryPrice < target && (currentPrice - entryPrice) / (target - entryPrice) >= 0.85)
  const invalidated = decision.positionGuidance === 'SAIR'
    || (
      short
        ? decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA' && Boolean(decision.invalidationReason)
        : decision.action === 'VENDER' && decision.entryTiming === 'AGORA' && decision.positionGuidance !== 'REALIZAR_ALVO' && Boolean(decision.invalidationReason)
    )
  const realizeSignal = decision.positionGuidance === 'REALIZAR_ALVO' || targetHit
  const structureOk = decision.checklist.find((c) => c.label.includes('intacta'))?.complete !== false
  const biasOk = short ? decision.bias === 'bearish' : decision.bias === 'bullish'
  const stillAddNow = short
    ? decision.action === 'VENDER' && decision.entryTiming === 'AGORA' && decision.score >= 70
    : decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA' && decision.score >= 70
  const inDiscountOrZone = decision.checklist.some((c) => c.label.includes('Discount') && c.complete)
    || (decision.entryZone !== undefined && currentPrice >= decision.entryZone.low * 0.998 && currentPrice <= decision.entryZone.high * 1.002)

  let advice: PositionAdvice
  const reasons: string[] = []

  if (invalidUserStop) {
    reasons.push(
      short
        ? 'Stop abaixo da entrada ignorado — em short o stop fica acima do preço de entrada.'
        : 'Stop acima da entrada ignorado — em long o stop fica abaixo do Cost Price.',
    )
  }

  if (stopHit) {
    advice = 'SAIR'
    reasons.push(
      short
        ? `Preço (${currentPrice}) ≥ stop (${stop}). Protege o capital.`
        : `Preço (${currentPrice}) ≤ stop (${stop}). Protege o capital.`,
    )
  } else if (invalidated) {
    advice = 'SAIR'
    reasons.push(decision.invalidationReason ?? 'Estrutura invalidada (BOS contrário) — sai.')
  } else if (realizeSignal || nearTarget) {
    advice = 'REALIZAR'
    reasons.push(targetHit ? 'Alvo de liquidez atingido.' : 'Estás a ~85%+ do caminho até ao alvo — realiza parcial ou total.')
    if (decision.target !== undefined) reasons.push(`Alvo TJR: ${decision.target}`)
  } else if (stillAddNow && biasOk && structureOk && inDiscountOrZone && riskR >= -0.5 && decision.score >= 75) {
    advice = 'COMPRAR_MAIS'
    reasons.push(
      short
        ? 'Setup ainda SHORT JÁ com score alto e estrutura intacta.'
        : 'Setup ainda COMPRAR JÁ com score alto e estrutura intacta.',
    )
    reasons.push('Preço na zona — reforço só com tamanho pequeno (não doubles).')
    if (riskR < 0) reasons.push(`Atenção: estás a ${riskR.toFixed(2)}R — reforçar em perda é agressivo.`)
  } else if (
    biasOk
    && structureOk
    && !stopHit
    && (short ? currentPrice < (stop ?? Number.POSITIVE_INFINITY) : currentPrice > (stop ?? 0))
  ) {
    advice = 'MANTER'
    reasons.push(
      short
        ? 'Bias baixista e estrutura intacta — mantém o short com stop activo.'
        : 'Bias altista e estrutura intacta — mantém com stop activo.',
    )
    if (riskR > 0) reasons.push(`Lucro flutuante ~${riskR.toFixed(2)}R — podes subir o stop para break-even após +1R.`)
    else reasons.push(`PnL ${pnlPct.toFixed(2)}% — ainda dentro do plano se o stop aguentar.`)
  } else {
    advice = 'SAIR'
    reasons.push(
      biasOk
        ? 'Condições mistas — preferível reduzir/sair a forçar.'
        : short
          ? 'Bias já não é baixista — short perde edge; considera sair.'
          : 'Bias já não é altista — long perde edge; considera sair.',
    )
    if (!structureOk) reasons.push('Checklist indica estrutura comprometida.')
  }

  if (decision.reasons[0]) reasons.push(`Motor: ${decision.reasons[0]}`)

  const label = short && advice === 'COMPRAR_MAIS'
    ? 'REFORÇAR short (só se tiveres margem)'
    : adviceLabel[advice]

  return {
    advice,
    label,
    summary: buildSummary(advice, pnlPct, riskR),
    reasons,
    currentPrice,
    pnlPct,
    pnlUsdc,
    riskR,
    decision,
    levels: { stop, target, entry: decision.entry },
    usingEntryOco,
  }
}

const buildSummary = (advice: PositionAdvice, pnlPct: number, riskR: number) => {
  const pnl = `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (${riskR >= 0 ? '+' : ''}${riskR.toFixed(2)}R)`
  if (advice === 'SAIR') return `Recomendação: sair. PnL actual ${pnl}.`
  if (advice === 'REALIZAR') return `Recomendação: realizar. PnL actual ${pnl}.`
  if (advice === 'COMPRAR_MAIS') return `Recomendação: podes reforçar com cuidado. PnL ${pnl}.`
  return `Recomendação: manter. PnL actual ${pnl}.`
}

export function resolvePositionSymbol(raw: string, quote = 'USDC'): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleaned) return ''
  if (cleaned.endsWith(quote)) return cleaned
  return `${cleaned}${quote}`
}

export async function runPositionAdvice(
  input: OpenPositionInput,
  profile: RiskProfile,
  fetchPlaybook: (symbol: string) => Promise<Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>>,
  btcSymbol: string,
  tpMode: TpMode = '1_5r',
): Promise<PositionAdviceResult> {
  const [data, btc] = await Promise.all([fetchPlaybook(input.symbol), fetchPlaybook(btcSymbol)])
  const decision = evaluateTjrFull(input.symbol, data, btc, profile, tpMode, 'long', {
    openPosition: true,
    sessionMarket: 'crypto',
  })
  const currentPrice = data['1m'].at(-1)?.close ?? data['5m'].at(-1)?.close ?? data['1h'].at(-1)?.close ?? 0
  return adviseOpenPosition(input, currentPrice, decision)
}

export type T212PositionEvalOptions = {
  wideNet?: boolean
  cfdPractical?: boolean
  referenceLabel?: string
  requireSmtAlign?: boolean
  usIndexPlaybook?: boolean
  esNqAligned?: boolean
  esNqNote?: string
  sessionMarket?: 'crypto' | 'cfd'
}

/** CFD T212: long ou short, playbook do instrumento + referência (US500 / BTC). */
export async function runT212PositionAdvice(
  input: OpenPositionInput & { side: PositionSide },
  profile: RiskProfile,
  fetchPlaybook: () => Promise<Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>>,
  fetchReference: () => Promise<Record<'4h' | '1h' | '15m' | '5m' | '1m', Candle[]>>,
  symbolLabel: string,
  tpMode: TpMode = '1_5r',
  options: T212PositionEvalOptions = {},
): Promise<PositionAdviceResult> {
  const [data, reference] = await Promise.all([fetchPlaybook(), fetchReference()])
  const decision = evaluateTjrFull(symbolLabel, data, reference, profile, tpMode, input.side, {
    openPosition: true,
    sessionMarket: options.sessionMarket ?? 'cfd',
    wideNet: options.wideNet,
    cfdPractical: options.cfdPractical,
    referenceLabel: options.referenceLabel,
    requireSmtAlign: options.requireSmtAlign,
    usIndexPlaybook: options.usIndexPlaybook,
    esNqAligned: options.esNqAligned,
    esNqNote: options.esNqNote,
  })
  const currentPrice = data['1m'].at(-1)?.close ?? data['5m'].at(-1)?.close ?? data['1h'].at(-1)?.close ?? 0
  return adviseOpenPosition({ ...input, side: input.side }, currentPrice, decision)
}

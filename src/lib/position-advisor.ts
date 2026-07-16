import { evaluateTjrFull, type TjrDecision } from './tjr-engine'
import type { TpMode } from './tp-mode'
import type { RiskProfile } from './risk-profile'
import type { Candle } from './types'

export type PositionAdvice = 'SAIR' | 'REALIZAR' | 'MANTER' | 'COMPRAR_MAIS'

export type OpenPositionInput = {
  symbol: string
  entryPrice: number
  quantity?: number
  userStop?: number
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
  const { entryPrice, quantity, userStop } = input
  const stop = userStop ?? decision.stop
  const target = decision.target
  const riskPerUnit = stop !== undefined ? Math.abs(entryPrice - stop) : entryPrice * 0.035
  const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlUsdc = quantity !== undefined ? (currentPrice - entryPrice) * quantity : undefined
  const riskR = riskPerUnit > 0 ? (currentPrice - entryPrice) / riskPerUnit : 0

  const stopHit = stop !== undefined && currentPrice <= stop
  const targetHit = target !== undefined && currentPrice >= target
  const nearTarget = target !== undefined && entryPrice < target
    && (currentPrice - entryPrice) / (target - entryPrice) >= 0.85
  const invalidated = decision.positionGuidance === 'SAIR'
    || (decision.action === 'VENDER' && decision.entryTiming === 'AGORA' && decision.positionGuidance !== 'REALIZAR_ALVO' && Boolean(decision.invalidationReason))
  const realizeSignal = decision.positionGuidance === 'REALIZAR_ALVO' || targetHit
  const structureOk = decision.checklist.find((c) => c.label.includes('intacta'))?.complete !== false
  const biasLong = decision.bias === 'bullish'
  const stillBuyNow = decision.action === 'COMPRAR' && decision.entryTiming === 'AGORA' && decision.score >= 70
  const inDiscountOrZone = decision.checklist.some((c) => c.label.includes('Discount') && c.complete)
    || (decision.entryZone !== undefined && currentPrice >= decision.entryZone.low * 0.998 && currentPrice <= decision.entryZone.high * 1.002)

  let advice: PositionAdvice
  const reasons: string[] = []

  if (stopHit) {
    advice = 'SAIR'
    reasons.push(`Preço (${currentPrice}) ≤ stop (${stop}). Protege o capital.`)
  } else if (invalidated) {
    advice = 'SAIR'
    reasons.push(decision.invalidationReason ?? 'Estrutura invalidada (BOS contrário) — sai.')
  } else if (realizeSignal || nearTarget) {
    advice = 'REALIZAR'
    reasons.push(targetHit ? 'Alvo de liquidez atingido.' : 'Estás a ~85%+ do caminho até ao alvo — realiza parcial ou total.')
    if (decision.target !== undefined) reasons.push(`Alvo TJR: ${decision.target}`)
  } else if (stillBuyNow && biasLong && structureOk && inDiscountOrZone && riskR >= -0.5 && decision.score >= 75) {
    advice = 'COMPRAR_MAIS'
    reasons.push('Setup ainda COMPRAR JÁ com score alto e estrutura intacta.')
    reasons.push('Preço na zona/discount — reforço só com tamanho pequeno (não doubles).')
    if (riskR < 0) reasons.push(`Atenção: estás a ${riskR.toFixed(2)}R — reforçar em perda é agressivo.`)
  } else if (biasLong && structureOk && !stopHit && currentPrice > (stop ?? 0)) {
    advice = 'MANTER'
    reasons.push('Bias altista e estrutura intacta — mantém com stop activo.')
    if (riskR > 0) reasons.push(`Lucro flutuante ~${riskR.toFixed(2)}R — podes subir o stop para break-even após +1R.`)
    else reasons.push(`PnL ${pnlPct.toFixed(2)}% — ainda dentro do plano se o stop aguentar.`)
  } else {
    advice = 'SAIR'
    reasons.push(biasLong ? 'Condições mistas — preferível reduzir/sair a forçar.' : 'Bias já não é altista — Spot long perde edge; considera sair.')
    if (!structureOk) reasons.push('Checklist indica estrutura comprometida.')
  }

  if (decision.reasons[0]) reasons.push(`Motor: ${decision.reasons[0]}`)

  return {
    advice,
    label: adviceLabel[advice],
    summary: buildSummary(advice, pnlPct, riskR),
    reasons,
    currentPrice,
    pnlPct,
    pnlUsdc,
    riskR,
    decision,
    levels: { stop, target, entry: decision.entry },
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
  const decision = evaluateTjrFull(input.symbol, data, btc, profile, tpMode)
  const currentPrice = data['1m'].at(-1)?.close ?? data['5m'].at(-1)?.close ?? data['1h'].at(-1)?.close ?? 0
  return adviseOpenPosition(input, currentPrice, decision)
}

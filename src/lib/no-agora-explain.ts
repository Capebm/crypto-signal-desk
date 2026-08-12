import { getInstrumentMarketStatus } from './trading-session'
import type { TjrDecision } from './tjr-engine'
import { isAwaitingEntry, isEnterLongNow, isEnterShortNow } from './tjr-engine'

type RowLike = Pick<TjrDecision, 'checklist' | 'entryTiming' | 'reasons' | 'action' | 'positionGuidance'> & {
  instrument?: { kind: 'index' | 'future' | 'forex' | 'metal' | 'energy' | 'crypto' | 'stock'; short?: string }
}

/**
 * Texto curto quando o scan não tem LONG/SHORT JÁ — explica o gargalo principal.
 */
export function explainNoAgora(rows: RowLike[], opts?: {
  tjrVideoStrict?: boolean
  cfdPractical?: boolean
  esNqBlocked?: boolean
}): string {
  if (rows.length === 0) return 'Sem linhas no scan.'

  const parts: string[] = []
  const closed = rows.filter((r) => {
    if (r.instrument && !getInstrumentMarketStatus(r.instrument.kind).open) return true
    if (r.checklist?.some((c) => c.label === 'Mercado do instrumento' && !c.complete)) return true
    if (r.reasons?.some((x) => /CLOSED/i.test(x))) return true
    return false
  })
  if (closed.length > 0) {
    const sample = closed.slice(0, 3).map((r) => r.instrument?.short ?? '?').join(', ')
    parts.push(`${closed.length} CLOSED (${sample}${closed.length > 3 ? '…' : ''}) — sem JÁ até ao open`)
  }

  const confirmLive = rows.filter((r) =>
    r.checklist?.some((c) => c.label === 'Dados LTF live' && !c.complete))
  if (confirmLive.length > 0) {
    parts.push(`${confirmLive.length} em CONFIRMAR LIVE (feed 1m atrasado/fallback)`)
  }

  const aguardar = rows.filter((r) =>
    isAwaitingEntry(r as TjrDecision)
    && !r.checklist?.some((c) => c.label === 'Dados LTF live' && !c.complete))
  const waitingLtf = aguardar.filter((r) => {
    const ltf = r.checklist?.find((c) => c.label.startsWith('4.'))
    return ltf && !ltf.complete
  })
  if (waitingLtf.length > 0) {
    parts.push(`${waitingLtf.length} à espera LTF 1m (retrace→BOS/iFVG)`)
  } else if (aguardar.length > 0) {
    parts.push(`${aguardar.length} em Aguardar (setup quase pronto)`)
  }

  if (opts?.esNqBlocked) parts.push('ES↔NQ 5m desalinhados')
  if (opts?.tjrVideoStrict) parts.push('Disciplina activa (filtro mais apertado)')
  if (opts?.cfdPractical === false) parts.push('CFD prático off')

  if (parts.length === 0) {
    return 'Nenhum setup completo nos 4 passos TJR neste scan. Normal fora da NY open.'
  }
  return `Porquê 0 JÁ: ${parts.join(' · ')}.`
}

/** Contagens rápidas para banner Agent (Spot 24/7 — sem CLOSED de stocks). */
export function explainNoAgoraSpot(rows: RowLike[], opts?: {
  tjrVideoStrict?: boolean
  avoidNyMid?: boolean
  inIdealWindow?: boolean
}): string {
  const aguardar = rows.filter((r) => isAwaitingEntry(r as TjrDecision))
  const waitingLtf = aguardar.filter((r) => {
    const ltf = r.checklist?.find((c) => c.label.startsWith('4.'))
    return ltf && !ltf.complete
  })
  const parts: string[] = []
  if (waitingLtf.length > 0) parts.push(`${waitingLtf.length} à espera BOS/iFVG 1m`)
  else if (aguardar.length > 0) parts.push(`${aguardar.length} em Aguardar`)
  if (opts?.tjrVideoStrict) parts.push('Disciplina activa')
  if (opts?.avoidNyMid && opts.inIdealWindow === false) parts.push('fora NY open / mid evitado')
  if (parts.length === 0) return 'Nenhum COMPRAR JÁ — falta completar sweep→confirm→continuação→LTF.'
  return `Porquê 0 COMPRAR JÁ: ${parts.join(' · ')}.`
}

export function countActionNow(rows: TjrDecision[]) {
  return rows.filter((r) => isEnterLongNow(r) || isEnterShortNow(r)).length
}

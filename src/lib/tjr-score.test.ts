import { describe, expect, it } from 'vitest'
import { computeTjrScore, tjrActionLabel, type TjrDecision } from './tjr-engine'

const fullChecklist = (done: boolean[]): TjrDecision['checklist'] => {
  const labels = [
    '1. Sweep (draw HTF)',
    '2. Confirmação + displacement',
    '3. Continuação (FVG / EQ)',
    '4. Entrada LTF (retrace→BOS)',
    'Bias HTF (4h)',
    'Discount / premium',
    'Estrutura 15m intacta',
    'Alinhamento vs BTC',
    'R:R / TP (1R)',
    'Killzone open/close',
  ]
  return labels.map((label, i) => ({ label, complete: Boolean(done[i]), note: '' }))
}

const base = (partial: Partial<TjrDecision>): TjrDecision => ({
  action: 'ESPERAR',
  confidence: 'Baixa',
  reasons: [],
  score: 0,
  bias: 'neutral',
  setupStatus: 'BLOQUEADA',
  entryTiming: 'NENHUM',
  positionGuidance: 'NEUTRO',
  checklist: fullChecklist([false, false, false, false, false, false, false, false, false, false]),
  zones: [],
  ...partial,
})

describe('computeTjrScore (algorithm contract)', () => {
  it('ranks COMPRAR JÁ higher than ESPERAR with same checklist', () => {
    const checks = fullChecklist([true, true, true, true, true, true, true, true, true, true])
    const wait = computeTjrScore(base({ checklist: checks }))
    const buyNow = computeTjrScore(base({
      action: 'COMPRAR',
      entryTiming: 'AGORA',
      positionGuidance: 'ENTRAR_AGORA',
      setupStatus: 'CONFIRMADA',
      confidence: 'Alta',
      riskReward: 1.5,
      checklist: checks,
    }))
    expect(buyNow).toBeGreaterThan(wait)
    expect(buyNow).toBeGreaterThanOrEqual(70)
  })

  it('separates many completed checks from few (ESPERAR band)', () => {
    const few = computeTjrScore(base({
      checklist: fullChecklist([true, true, false, false, false, false, true, false, false, true]),
    }))
    const many = computeTjrScore(base({
      checklist: fullChecklist([true, true, true, false, true, true, true, true, true, true]),
      confidence: 'Média',
      setupStatus: 'A_AGUARDAR',
    }))
    expect(many - few).toBeGreaterThanOrEqual(15)
  })

  it('keeps SAIR high-priority for open-position exits', () => {
    const sair = computeTjrScore(base({
      action: 'VENDER',
      entryTiming: 'AGORA',
      positionGuidance: 'SAIR',
      confidence: 'Alta',
      setupStatus: 'BLOQUEADA',
      riskReward: 1.2,
      checklist: fullChecklist([true, true, true, false, true, true, false, true, true, true]),
    }))
    expect(sair).toBeGreaterThan(50)
  })
})

describe('tjrActionLabel', () => {
  it('labels COMPRAR + AGORA as COMPRAR JÁ', () => {
    expect(tjrActionLabel({ action: 'COMPRAR', entryTiming: 'AGORA', positionGuidance: 'ENTRAR_AGORA' })).toMatch(/COMPRAR JÁ/)
  })
})

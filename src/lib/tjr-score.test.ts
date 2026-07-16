import { describe, expect, it } from 'vitest'
import { computeTjrScore, tjrActionLabel, type TjrDecision } from './tjr-engine'

/** Smoke tests — protect scoring/labels without touching evaluate candles. */
const base = (partial: Partial<TjrDecision>): TjrDecision => ({
  action: 'ESPERAR',
  confidence: 'Baixa',
  reasons: [],
  score: 0,
  bias: 'neutral',
  setupStatus: 'BLOQUEADA',
  entryTiming: 'NENHUM',
  positionGuidance: 'NEUTRO',
  checklist: [
    { label: '1. Sweep (draw HTF)', complete: false, note: '' },
    { label: '2. Confirmação + displacement', complete: false, note: '' },
    { label: '3. Continuação (FVG / EQ)', complete: false, note: '' },
    { label: '4. Entrada 1m (retrace→BOS)', complete: false, note: '' },
  ],
  zones: [],
  ...partial,
})

describe('computeTjrScore (algorithm contract)', () => {
  it('ranks COMPRAR JÁ higher than ESPERAR with same checklist', () => {
    const wait = computeTjrScore(base({}))
    const buyNow = computeTjrScore(base({
      action: 'COMPRAR',
      entryTiming: 'AGORA',
      positionGuidance: 'ENTRAR_AGORA',
      setupStatus: 'CONFIRMADA',
      confidence: 'Alta',
      riskReward: 1.5,
      checklist: [
        { label: '1. Sweep (draw HTF)', complete: true, note: '' },
        { label: '2. Confirmação + displacement', complete: true, note: '' },
        { label: '3. Continuação (FVG / EQ)', complete: true, note: '' },
        { label: '4. Entrada 1m (retrace→BOS)', complete: true, note: '' },
      ],
    }))
    expect(buyNow).toBeGreaterThan(wait)
    expect(buyNow).toBeGreaterThanOrEqual(70)
  })

  it('keeps SAIR high-priority for open-position exits', () => {
    const sair = computeTjrScore(base({
      action: 'VENDER',
      entryTiming: 'AGORA',
      positionGuidance: 'SAIR',
      confidence: 'Alta',
      setupStatus: 'BLOQUEADA',
      riskReward: 1.2,
      checklist: [
        { label: '1. Sweep (draw HTF)', complete: true, note: '' },
        { label: '2. Confirmação + displacement', complete: true, note: '' },
        { label: '3. Continuação (FVG / EQ)', complete: true, note: '' },
        { label: '4. Entrada 1m (retrace→BOS)', complete: false, note: '' },
      ],
    }))
    expect(sair).toBeGreaterThan(50)
  })
})

describe('tjrActionLabel', () => {
  it('labels COMPRAR + AGORA as COMPRAR JÁ', () => {
    expect(tjrActionLabel({ action: 'COMPRAR', entryTiming: 'AGORA', positionGuidance: 'ENTRAR_AGORA' })).toMatch(/COMPRAR JÁ/)
  })
})

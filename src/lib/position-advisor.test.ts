import { describe, expect, it } from 'vitest'
import { adviseOpenPosition } from './position-advisor'
import type { TjrDecision } from './tjr-engine'

const decision = (partial: Partial<TjrDecision> = {}): TjrDecision => ({
  action: 'COMPRAR',
  confidence: 'Média',
  reasons: ['1· Sweep HTF.'],
  entry: 0.51,
  stop: 0.48,
  target: 0.54,
  riskReward: 1.5,
  score: 12,
  bias: 'bullish',
  setupStatus: 'A_AGUARDAR',
  entryTiming: 'RETRACE',
  positionGuidance: 'AGUARDAR_ENTRADA',
  checklist: [
    { label: '1. Sweep (draw HTF)', complete: true, note: '' },
    { label: 'Estrutura 15m intacta', complete: true, note: '' },
    { label: 'Discount / premium', complete: true, note: '' },
  ],
  zones: [],
  ...partial,
})

describe('adviseOpenPosition (OCO lock)', () => {
  it('uses user OCO stop/target when provided (does not replace with engine levels)', () => {
    const result = adviseOpenPosition(
      {
        symbol: 'REUSDC',
        entryPrice: 0.5145,
        quantity: 38.8,
        userStop: 0.496,
        userTarget: 0.532,
      },
      0.514,
      decision({ stop: 0.49, target: 0.527, score: 9 }),
    )
    expect(result.usingEntryOco).toBe(true)
    expect(result.levels.stop).toBe(0.496)
    expect(result.levels.target).toBe(0.532)
    expect(result.advice).toBe('MANTER')
    expect(result.decision.score).toBe(9)
  })

  it('falls back to structural levels when OCO missing', () => {
    const result = adviseOpenPosition(
      { symbol: 'REUSDC', entryPrice: 0.5145 },
      0.52,
      decision({ stop: 0.49, target: 0.54 }),
    )
    expect(result.usingEntryOco).toBe(false)
    expect(result.levels.stop).toBe(0.49)
    expect(result.levels.target).toBe(0.54)
  })

  it('computes short PnL and stop above entry', () => {
    const result = adviseOpenPosition(
      {
        symbol: 'GER40',
        entryPrice: 18_500,
        quantity: 1,
        side: 'short',
        userStop: 18_700,
        userTarget: 18_200,
      },
      18_400,
      decision({
        action: 'VENDER',
        bias: 'bearish',
        stop: 18_650,
        target: 18_100,
        positionGuidance: 'AGUARDAR_ENTRADA',
      }),
    )
    expect(result.pnlPct).toBeCloseTo((100 / 18_500) * 100, 2)
    expect(result.usingEntryOco).toBe(true)
    expect(result.levels.stop).toBe(18_700)
    expect(result.advice).toBe('MANTER')
  })
})

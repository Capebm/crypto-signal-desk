import { describe, expect, it } from 'vitest'
import { explainNoAgora, explainNoAgoraSpot } from './no-agora-explain'

describe('explainNoAgora', () => {
  it('mentions CLOSED instruments', () => {
    const text = explainNoAgora([
      {
        action: 'COMPRAR',
        entryTiming: 'RETRACE',
        positionGuidance: 'AGUARDAR_ENTRADA',
        checklist: [{ label: 'Mercado do instrumento', complete: false, note: 'closed' }],
        reasons: ['Instrumento CLOSED — sem LONG/SHORT JÁ.'],
        instrument: { kind: 'stock', short: 'UBER' },
      },
    ])
    expect(text).toContain('CLOSED')
    expect(text).toContain('UBER')
  })

  it('spot variant mentions LTF wait', () => {
    const text = explainNoAgoraSpot([
      {
        action: 'COMPRAR',
        entryTiming: 'RETRACE',
        positionGuidance: 'AGUARDAR_ENTRADA',
        checklist: [{ label: '4. Entrada LTF (retrace→BOS)', complete: false, note: 'wait' }],
        reasons: [],
      },
    ])
    expect(text).toMatch(/LTF|BOS|Aguardar/i)
  })
})

import { describe, expect, it } from 'vitest'
import { computeMarketRegime } from './market-regime'

describe('computeMarketRegime', () => {
  it('flags hostile when BTC bearish and many high sweeps', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      opposedSweep: i < 3,
      action: i === 0 ? 'COMPRAR' : 'ESPERAR',
    }))
    const regime = computeMarketRegime(rows, 'bearish')
    expect(regime.tone).toBe('hostile')
    expect(regime.highSweepHeavy).toBe(3)
  })

  it('is ok when BTC bullish with long candidates', () => {
    const regime = computeMarketRegime(
      [{ action: 'COMPRAR' }, { action: 'ESPERAR' }, { action: 'COMPRAR' }],
      'bullish',
    )
    expect(regime.tone).toBe('ok')
    expect(regime.longCandidates).toBe(2)
  })
})

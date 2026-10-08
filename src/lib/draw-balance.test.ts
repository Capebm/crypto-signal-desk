import { describe, expect, it } from 'vitest'
import { computeDrawBalance } from './draw-balance'

describe('computeDrawBalance', () => {
  it('counts untaken highs above and lows below, merging levels that sit together', () => {
    const balance = computeDrawBalance(100, [
      { kind: 'high', price: 101 },
      { kind: 'high', price: 101.03 }, // mesmo draw que 101 (< 0,05%)
      { kind: 'high', price: 104 },
      { kind: 'high', price: 99 }, // high já tomado: não conta
      { kind: 'low', price: 97 },
      { kind: 'low', price: 102 }, // low acima do preço: não conta
    ])
    expect(balance).toEqual({ above: 2, below: 1, nearAbovePct: 1, nearBelowPct: 3 })
  })

  it('leaves the distance empty when one side has no draws', () => {
    expect(computeDrawBalance(50, [{ kind: 'low', price: 49 }])).toEqual({ above: 0, below: 1, nearAbovePct: undefined, nearBelowPct: 2 })
    expect(computeDrawBalance(0, [])).toBeUndefined()
  })
})

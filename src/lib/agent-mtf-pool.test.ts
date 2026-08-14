import { describe, expect, it } from 'vitest'
import { agentUsesPracticalConfirm, selectAgentMtfPool } from './agent-mtf-pool'

describe('agentUsesPracticalConfirm', () => {
  it('matches T212 Prático/Malha and stays off for Disciplina', () => {
    expect(agentUsesPracticalConfirm(false, true)).toBe(true)
    expect(agentUsesPracticalConfirm(true, false)).toBe(false)
    expect(agentUsesPracticalConfirm(true, true)).toBe(false)
    expect(agentUsesPracticalConfirm(false, false)).toBe(false)
  })
})

describe('selectAgentMtfPool', () => {
  const row = (symbol: string, action = 'ESPERAR', extra: Partial<{ bias: string; opposedSweep: boolean }> = {}) => ({
    symbol,
    action,
    bias: extra.bias,
    opposedSweep: extra.opposedSweep,
  })

  it('always keeps T212 overlap cryptos in the MTF pool even with a weak 1h score', () => {
    const sorted = [
      row('AAAUSDC', 'COMPRAR'),
      row('XRPUSDC'),
      row('ETHUSDC', 'ESPERAR', { bias: 'bearish', opposedSweep: true }),
    ]
    const pool = selectAgentMtfPool(sorted, {
      scanAllSetups: true,
      scoutSymbols: new Set(),
      prioritySymbols: new Set(['XRPUSDC', 'ETHUSDC']),
      limit: 2,
    })
    expect(pool.map((item) => item.symbol)).toEqual(['XRPUSDC', 'ETHUSDC'])
  })
})

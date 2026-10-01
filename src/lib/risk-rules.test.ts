import { describe, expect, it } from 'vitest'
import { DEFAULT_RISK_SETTINGS, inEntryWindow, riskBasedStake, riskWarnings } from './risk-rules'

describe('risk rules', () => {
  it('entry window is 13:30–16:00 UTC', () => {
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 13, 29)))).toBe(false)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 13, 30)))).toBe(true)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 15, 59)))).toBe(true)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 16, 0)))).toBe(false)
  })

  it('sizes the position so the stop costs riskPct of capital', () => {
    const stake = riskBasedStake(DEFAULT_RISK_SETTINGS, 100, 99)
    expect(stake.riskAmount).toBeCloseTo(1.5)
    expect(stake.notional).toBeCloseTo(150)
    expect(stake.stopPct).toBeCloseTo(1)
  })

  it('flags each rule independently', () => {
    const base = {
      at: new Date(Date.UTC(2026, 9, 1, 14, 0)),
      openPositions: 0,
      todayPnl: 0,
      settings: DEFAULT_RISK_SETTINGS,
    }
    expect(riskWarnings({ ...base, venue: 't212', instrumentKind: 'index', entry: 20000 })).toEqual([])
    const codes = riskWarnings({
      ...base,
      at: new Date(Date.UTC(2026, 9, 1, 17, 0)),
      venue: 't212',
      instrumentKind: 'stock',
      openPositions: 2,
      todayPnl: -6,
    }).map((w) => w.code)
    expect(codes).toEqual(['fora_janela', 'acao_cfd', 'max_posicoes', 'limite_diario'])
    expect(riskWarnings({ ...base, venue: 'spot', instrumentKind: 'crypto', entry: 0.4 }).map((w) => w.code)).toEqual(['alt_sub_1'])
  })
})

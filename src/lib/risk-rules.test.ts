import { describe, expect, it } from 'vitest'
import { exchangeFor } from './index-exchanges'
import { DEFAULT_RISK_SETTINGS, inEntryWindow, riskBasedStake, riskWarnings } from './risk-rules'

describe('risk rules', () => {
  it('entry window is 13:30–16:00 UTC in US summer time', () => {
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 13, 29)))).toBe(false)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 13, 30)))).toBe(true)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 15, 59)))).toBe(true)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 1, 16, 0)))).toBe(false)
  })

  it('entry window follows New York time after the US clock change (14:30–17:00 UTC in winter)', () => {
    expect(inEntryWindow(new Date(Date.UTC(2026, 10, 10, 13, 45)))).toBe(false)
    expect(inEntryWindow(new Date(Date.UTC(2026, 10, 10, 14, 30)))).toBe(true)
    expect(inEntryWindow(new Date(Date.UTC(2026, 10, 10, 16, 59)))).toBe(true)
    expect(inEntryWindow(new Date(Date.UTC(2026, 10, 10, 17, 0)))).toBe(false)
  })

  it('each index uses the open of its own exchange', () => {
    const ger = exchangeFor('GER40') // Frankfurt 09:00 CEST = 07:00 UTC → 07:00–09:30 UTC
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 8, 6, 59)), ger)).toBe(false)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 8, 7, 0)), ger)).toBe(true)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 8, 9, 30)), ger)).toBe(false)
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 8, 14, 0)), ger)).toBe(false)
    const tokyo = exchangeFor('jpn225') // 09:00 JST = 00:00 UTC
    expect(inEntryWindow(new Date(Date.UTC(2026, 9, 8, 0, 30)), tokyo)).toBe(true)
    expect(exchangeFor('BTCUSDC').label).toBe('Nova Iorque')
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

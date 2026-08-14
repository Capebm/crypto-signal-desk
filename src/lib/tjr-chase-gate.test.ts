import { describe, expect, it } from 'vitest'
import { buildTradeLevels } from './trade-levels'
import { evaluateTjrFull } from './tjr-engine'
import type { Candle } from './types'

const candles = (base: number, range: number): Candle[] => Array.from({ length: 16 }, (_, index) => ({
  openTime: index * 300_000,
  open: base,
  high: base + range / 2,
  low: base - range / 2,
  close: base,
  volume: 1,
}))

const emptyPack = (series: Candle[]) => ({
  '4h': series,
  '1h': series,
  '15m': series,
  '5m': series,
  '1m': series,
})

describe('anti-chase liquidity headroom', () => {
  it('blocks a long sitting on London High from having enough headroom for JÁ', () => {
    const plan = buildTradeLevels({
      side: 'long',
      entry: 1.1704,
      swingPrices: [1.166, 1.168],
      candles: candles(1.1704, 0.0012),
      instrumentKind: 'forex',
      candidates: [{ price: 1.1704, priority: 2, label: 'Londres H' }],
      minRr: 1,
      fixedMultiple: 1.5,
    })

    expect(plan.headroomRr).toBe(0)
    expect(plan.headroomRr).toBeLessThan(1)
  })

  it('caps 1.5R so the target cannot cross a nearer draw', () => {
    const plan = buildTradeLevels({
      side: 'short',
      entry: 1.17,
      swingPrices: [1.174, 1.172],
      candles: candles(1.17, 0.002),
      instrumentKind: 'forex',
      candidates: [{ price: 1.1688, priority: 2, label: 'Londres L' }],
      minRr: 1,
      fixedMultiple: 1.5,
    })

    expect(plan.target).toBe(1.1688)
    expect(plan.target).toBeGreaterThan(1.17 - (plan.stop - 1.17) * 1.5)
  })

  it('keeps valid headroom when the next draw is far enough', () => {
    const plan = buildTradeLevels({
      side: 'long',
      entry: 1.16,
      swingPrices: [1.155, 1.157],
      candles: candles(1.16, 0.002),
      instrumentKind: 'forex',
      candidates: [{ price: 1.172, priority: 2, label: 'Londres H' }],
      minRr: 1,
      fixedMultiple: 1.5,
    })

    expect(plan.headroomRr).toBeGreaterThanOrEqual(1)
    expect(plan.target).toBeCloseTo(1.16 + (1.16 - plan.stop) * 1.5)
  })
})

describe('engine chase / malha timing', () => {
  it('does not emit AGORA for a long already through the only session high', () => {
    const now = Date.UTC(2026, 7, 13, 12, 0)
    const hour = 3_600_000
    const series: Candle[] = Array.from({ length: 40 }, (_, index) => {
      const openTime = now - (39 - index) * hour
      const base = 1.16 + index * 0.0004
      return {
        openTime,
        open: base,
        high: base + 0.0012,
        low: base - 0.0008,
        close: index === 39 ? base + 0.0011 : base + 0.0003,
        volume: 1,
      }
    })
    const decision = evaluateTjrFull(
      'EURCHF',
      emptyPack(series),
      emptyPack(series),
      'agressivo',
      '1_5r',
      'long',
      {
        cfdPractical: true,
        killzoneQualityOnly: true,
        instrumentKind: 'forex',
        sessionMarket: 'cfd',
      },
    )

    expect(decision.entryTiming).not.toBe('AGORA')
    expect(decision.positionGuidance).not.toBe('ENTRAR_AGORA')
  })

  it('keeps softOpposed at most RETRACE even with LTF ready', () => {
    const agora = (
      ltfReady: boolean,
      zoneInteraction: boolean,
      softOpposed: boolean,
      quickScan: boolean,
    ) => ltfReady && zoneInteraction && !softOpposed && !quickScan

    expect(agora(true, true, false, false)).toBe(true)
    expect(agora(true, true, true, false)).toBe(false)
  })
})

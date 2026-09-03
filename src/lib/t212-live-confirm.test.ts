import { describe, expect, it } from 'vitest'
import { buildT212LivePrintPaste, requireLiveConfirmationForStaleLtf } from './t212-live-confirm'
import type { TjrDecision } from './tjr-engine'
import type { Candle } from './types'

const NOW = 1_800_000_000_000
const candle = (openTime: number): Candle => ({
  openTime,
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 10,
})
const enterNow = {
  action: 'COMPRAR',
  entryTiming: 'AGORA',
  positionGuidance: 'ENTRAR_AGORA',
  setupStatus: 'CONFIRMADA',
  reasons: [],
  checklist: [],
} as unknown as TjrDecision

describe('requireLiveConfirmationForStaleLtf', () => {
  it('keeps AGORA when the dedicated 1m candle is recent', () => {
    const result = requireLiveConfirmationForStaleLtf(
      enterNow,
      { '1m': [candle(NOW - 60_000)], '5m': [candle(NOW - 300_000)] },
      NOW,
    )

    expect(result.entryTiming).toBe('AGORA')
    expect(result.ltfFeedFresh).toBe(true)
    expect(result.liveConfirmationRequired).toBeUndefined()
  })

  it('downgrades AGORA when the 1m candle is delayed', () => {
    const result = requireLiveConfirmationForStaleLtf(
      enterNow,
      { '1m': [candle(NOW - 10 * 60_000)], '5m': [candle(NOW - 10 * 60_000)] },
      NOW,
    )

    expect(result.entryTiming).toBe('RETRACE')
    expect(result.positionGuidance).toBe('AGUARDAR_ENTRADA')
    expect(result.liveConfirmationRequired).toBe(true)
    expect(result.ltfDataAgeMinutes).toBe(10)
  })

  it('rejects a fresh-looking 5m fallback used as 1m', () => {
    const fallback = [candle(NOW - 60_000)]
    const result = requireLiveConfirmationForStaleLtf(
      enterNow,
      { '1m': fallback, '5m': fallback },
      NOW,
    )

    expect(result.liveConfirmationRequired).toBe(true)
    expect(result.checklist.at(-1)?.label).toBe('Dados LTF live')
  })

  it('builds the Claude paste with T212 ticker and levels', () => {
    const text = buildT212LivePrintPaste({
      ticker: 'MATIC',
      sideLabel: 'Sell',
      entry: 0.19,
      stop: 0.2,
      target: 0.17,
      stakeEur: 50,
      livePrice: 0.185,
    })
    expect(text).toContain('SHORT (Sell)')
    expect(text).toContain('Ticker T212: MATIC')
    expect(text).toContain('Stop: 0.2000')
    expect(text).toContain('Preço live T212: 0.1850')
    expect(text).toContain('não esperar :00')
    expect(text).toContain('desk 5m')
    expect(text).toContain('T212 1m')
  })
})

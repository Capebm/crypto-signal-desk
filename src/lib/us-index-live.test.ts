import { describe, expect, it } from 'vitest'
import { bucketCandles, futuresBasis, spliceLiveTail, withLiveIndexTail } from './us-index-live'
import type { Candle } from './types'

const t0 = Date.UTC(2026, 9, 8, 13, 30)
const c = (minutes: number, close: number, high = close + 1, low = close - 1): Candle => ({
  openTime: t0 + minutes * 60_000,
  open: close,
  high,
  low,
  close,
  volume: 1,
})

describe('futuresBasis', () => {
  it('takes the median futures − index over the shared candles', () => {
    expect(futuresBasis([c(0, 31_240), c(1, 31_250), c(2, 31_300)], [c(0, 31_000), c(1, 31_012), c(2, 31_020), c(3, 31_030)])).toBe(240)
    expect(futuresBasis([c(5, 1)], [c(0, 1)])).toBeUndefined()
  })
})

describe('spliceLiveTail', () => {
  it('updates the bar in progress and appends newer index bars shifted to the futures scale', () => {
    const out = spliceLiveTail([c(0, 100), c(1, 101)], [c(1, 90, 95, 89), c(2, 92)], 10)
    expect(out.map((bar) => bar.close)).toEqual([100, 100, 102])
    expect(out[1]).toMatchObject({ open: 101, high: 105, low: 99 })
  })
})

describe('bucketCandles', () => {
  it('regroups 5m index bars on the hourly grid of the futures', () => {
    // 09:30, 09:35 … 10:05 ET → buckets das 13:00 e 14:00 UTC
    const fives = Array.from({ length: 8 }, (_, i) => c(i * 5, 100 + i))
    const hours = bucketCandles(fives, 3_600_000)
    expect(hours.map((bar) => new Date(bar.openTime).getUTCHours())).toEqual([13, 14])
    expect(hours[0]).toMatchObject({ close: 105, high: 106 })
  })
})

describe('withLiveIndexTail', () => {
  const frames = (bars: Candle[]) => ({ '1h': bars, '15m': bars, '5m': bars, '1m': bars })
  it('only applies when the index has a fresh 1m candle', () => {
    const futures = frames([c(0, 31_240)])
    const index = frames([c(0, 31_000), c(10, 31_100)])
    expect(withLiveIndexTail(futures, index, t0 + 20 * 60_000)).toBeUndefined()
    const live = withLiveIndexTail(futures, index, t0 + 11 * 60_000)!
    expect(live.basis).toBe(240)
    expect(live['1m'].at(-1)?.close).toBe(31_340)
  })
})

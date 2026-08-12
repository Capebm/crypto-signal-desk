import { describe, expect, it } from 'vitest'
import { mapPool } from './map-pool'

describe('mapPool', () => {
  it('respects concurrency and preserves order', async () => {
    let live = 0
    let peak = 0
    const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise((r) => setTimeout(r, 20))
      live -= 1
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50, 60])
    expect(peak).toBeLessThanOrEqual(2)
  })
})

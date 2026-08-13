import { describe, expect, it } from 'vitest'
import {
  activeBreakerBlock,
  activeOrderBlock,
  findConfirmedOrderBlocks,
  selectContinuationZone,
  type ConfirmedBlock,
  type FairValueGap,
} from './tjr-structure'
import type { Candle } from './types'

const candle = (open: number, high: number, low: number, close: number, index: number): Candle => ({
  openTime: index * 300_000,
  open,
  high,
  low,
  close,
  volume: 1,
})

const bullishBosSeries = (): Candle[] => [
  candle(100, 103, 99, 102, 0),
  candle(102, 104, 99, 100, 1), // swing high 104
  candle(100, 101, 97, 98, 2),
  candle(98, 101, 97, 100, 3),
  candle(100, 102, 99, 101, 4),
  candle(101, 102, 98, 99, 5), // bullish OB source: 98–101
  candle(99, 106, 99, 105, 6), // close BOS above 104
]

describe('confirmed continuation blocks', () => {
  it('creates a bullish OB only after a bullish BOS confirmation', () => {
    const before = findConfirmedOrderBlocks(bullishBosSeries().slice(0, -1))
    expect(before).toHaveLength(0)

    const blocks = findConfirmedOrderBlocks(bullishBosSeries())
    const active = activeOrderBlock(blocks, 'bullish')
    expect(active).toMatchObject({
      low: 98,
      high: 101,
      direction: 'bullish',
      kind: 'order-block',
      createdAt: 6,
    })
  })

  it('turns an invalidated bullish OB into a bearish breaker', () => {
    const invalidated = [
      ...bullishBosSeries(),
      candle(105, 105, 96, 97, 7),
    ]
    const blocks = findConfirmedOrderBlocks(invalidated)
    expect(activeOrderBlock(blocks, 'bullish')).toBeUndefined()
    expect(activeBreakerBlock(invalidated, blocks, 'bearish')).toMatchObject({
      low: 98,
      high: 101,
      direction: 'bearish',
      kind: 'breaker-block',
    })
  })

  it('retires the breaker after price closes through its opposite edge', () => {
    const brokenAgain = [
      ...bullishBosSeries(),
      candle(105, 105, 96, 97, 7),
      candle(97, 103, 97, 102, 8),
    ]
    const blocks = findConfirmedOrderBlocks(brokenAgain)
    expect(activeBreakerBlock(brokenAgain, blocks, 'bearish')).toBeUndefined()
  })

  it('selects FVG before EQ, OB and breaker deterministically', () => {
    const fvg: FairValueGap = {
      low: 100,
      high: 101,
      kind: 'fair-value-gap',
      bullish: true,
      index: 5,
      disrespected: false,
    }
    const orderBlock: ConfirmedBlock = {
      low: 98,
      high: 99,
      kind: 'order-block',
      direction: 'bullish',
      sourceIndex: 2,
      createdAt: 6,
    }
    const breakerBlock: ConfirmedBlock = {
      ...orderBlock,
      low: 96,
      high: 97,
      kind: 'breaker-block',
    }

    expect(selectContinuationZone([fvg], 'bullish', 95, orderBlock, breakerBlock)?.kind).toBe('fair-value-gap')
    expect(selectContinuationZone([], 'bullish', 95, orderBlock, breakerBlock)?.kind).toBe('equilibrium')
    expect(selectContinuationZone([], 'bullish', undefined, orderBlock, breakerBlock)?.kind).toBe('order-block')
    expect(selectContinuationZone([], 'bullish', undefined, undefined, breakerBlock)?.kind).toBe('breaker-block')
  })
})

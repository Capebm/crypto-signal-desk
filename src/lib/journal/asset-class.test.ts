import { describe, expect, it } from 'vitest'
import { classifyAssetClass } from './asset-class'

describe('classifyAssetClass', () => {
  it('classifica símbolos T212 do CSV real', () => {
    expect(classifyAssetClass('GER40', 't212')).toBe('index')
    expect(classifyAssetClass('USDJPY', 't212')).toBe('forex')
    expect(classifyAssetClass('NZDCHF', 't212')).toBe('forex')
    expect(classifyAssetClass('BRENT', 't212')).toBe('commodity')
    expect(classifyAssetClass('ETH', 't212')).toBe('crypto')
    expect(classifyAssetClass('META', 't212')).toBe('stock')
    expect(classifyAssetClass('BRK.B', 't212')).toBe('stock')
  })

  it('Spot é sempre crypto', () => {
    expect(classifyAssetClass('NOMUSDC', 'spot')).toBe('crypto')
  })
})

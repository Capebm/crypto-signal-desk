import { describe, expect, it } from 'vitest'
import { deskPrintSheetSize } from './t212-desk-print'

describe('deskPrintSheetSize', () => {
  it('stacks header, two labeled panels and footer', () => {
    const sheet = deskPrintSheetSize(720, 280)
    expect(sheet.width).toBe(720)
    expect(sheet.height).toBe(92 + 34 + 280 + 8 + 34 + 280 + 36)
  })
})

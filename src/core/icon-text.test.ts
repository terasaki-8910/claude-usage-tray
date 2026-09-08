import { describe, expect, it } from 'vitest'
import { formatPercentGlyphs } from './icon-text'

describe('formatPercentGlyphs', () => {
  it('never exceeds 2 characters for any input in [0..100] plus edge cases', () => {
    const inputs: (number | null | undefined)[] = [
      ...Array.from({ length: 101 }, (_, i) => i),
      null,
      undefined,
      NaN,
      -1,
      -100,
      150
    ]
    for (const input of inputs) {
      const out = formatPercentGlyphs(input)
      expect(out.length).toBeLessThanOrEqual(2)
    }
  })

  it('zero-pads single digits', () => {
    expect(formatPercentGlyphs(5)).toBe('05')
    expect(formatPercentGlyphs(0)).toBe('00')
  })

  it('renders two-digit values as-is', () => {
    expect(formatPercentGlyphs(65)).toBe('65')
  })

  it('clamps anything rounding to 100 or more to "99"', () => {
    expect(formatPercentGlyphs(100)).toBe('99')
    expect(formatPercentGlyphs(99.6)).toBe('99')
    expect(formatPercentGlyphs(150)).toBe('99')
  })

  it('shows "--" for unknown/invalid values', () => {
    expect(formatPercentGlyphs(null)).toBe('--')
    expect(formatPercentGlyphs(undefined)).toBe('--')
    expect(formatPercentGlyphs(NaN)).toBe('--')
    expect(formatPercentGlyphs(-1)).toBe('--')
  })

  it('rounds to the nearest integer', () => {
    expect(formatPercentGlyphs(64.6)).toBe('65')
    expect(formatPercentGlyphs(64.4)).toBe('64')
  })
})

import { describe, expect, it } from 'vitest'
import { renderGlyphs } from './bitmap-font'

const FG = [255, 255, 255, 255] as const
const BG = [0, 0, 0, 0] as const

describe('renderGlyphs — dimensions', () => {
  it('computes width from character count, scale, and the 1px gap', () => {
    const one = renderGlyphs('6', { scale: 2, fg: FG, bg: BG })
    expect(one.width).toBe(5 * 2) // no gap for a single glyph
    expect(one.height).toBe(7 * 2)

    const two = renderGlyphs('65', { scale: 2, fg: FG, bg: BG })
    expect(two.width).toBe(5 * 2 + 1 * 2 + 5 * 2) // glyph + gap + glyph
    expect(two.height).toBe(7 * 2)
  })

  it('produces a buffer of exactly width*height*4 bytes', () => {
    const icon = renderGlyphs('65', { scale: 3, fg: FG, bg: BG })
    expect(icon.buffer.length).toBe(icon.width * icon.height * 4)
  })

  it('never throws on an empty string, and returns a positive-size buffer', () => {
    const icon = renderGlyphs('', { scale: 2, fg: FG, bg: BG })
    expect(icon.width).toBeGreaterThan(0)
    expect(icon.height).toBeGreaterThan(0)
    expect(() => renderGlyphs('', { scale: 2, fg: FG, bg: BG })).not.toThrow()
  })

  it('never throws on an unrecognized character, rendering a blank cell', () => {
    expect(() => renderGlyphs('6?', { scale: 2, fg: FG, bg: BG })).not.toThrow()
    const icon = renderGlyphs('?', { scale: 2, fg: FG, bg: BG })
    // Every pixel should be background since '?' has no glyph.
    for (let i = 0; i < icon.buffer.length; i += 4) {
      expect(icon.buffer[i + 3]).toBe(BG[3])
    }
  })
})

describe('renderGlyphs — pixel content', () => {
  it('draws the "-" glyph as a single horizontal bar on its middle row', () => {
    const icon = renderGlyphs('-', { scale: 1, fg: FG, bg: BG })
    // '-' pattern: only row index 3 (0-based) is '11111', all others blank.
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        const idx = (row * icon.width + col) * 4
        const isForeground = icon.buffer[idx] === FG[0] && icon.buffer[idx + 3] === FG[3]
        expect(isForeground).toBe(row === 3)
      }
    }
  })

  it('scales a lit pixel into an NxN block of foreground color', () => {
    const scale = 4
    const icon = renderGlyphs('-', { scale, fg: FG, bg: BG })
    // Row 3, col 0 of the base glyph is lit -> the whole scaled block at
    // (0..3, 12..15) should be foreground.
    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        const x = 0 * scale + sx
        const y = 3 * scale + sy
        const idx = (y * icon.width + x) * 4
        expect([icon.buffer[idx], icon.buffer[idx + 1], icon.buffer[idx + 2], icon.buffer[idx + 3]]).toEqual([
          ...FG
        ])
      }
    }
  })
})

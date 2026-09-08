import { describe, expect, it } from 'vitest'
import { renderTrayIcon } from './bitmap-font'

const FG = [255, 255, 255, 255] as const
const ACCENT = [217, 119, 87, 255] as const

function pixelAt(icon: ReturnType<typeof renderTrayIcon>, x: number, y: number): number[] {
  const i = (y * icon.width + x) * 4
  return [icon.buffer[i], icon.buffer[i + 1], icon.buffer[i + 2], icon.buffer[i + 3]]
}

describe('renderTrayIcon — square canvas invariant', () => {
  // This is THE regression guard: a non-square icon gets rescaled by
  // Windows into the 16x16 tray slot, which squashed "03" into an
  // unreadable blob that read as "00".
  it('is always exactly size x size, whatever the text', () => {
    for (const text of ['0', '03', '99', '--', '', '7']) {
      for (const size of [16, 20, 24, 32]) {
        const icon = renderTrayIcon(text, { size, fg: FG })
        expect(icon.width).toBe(size)
        expect(icon.height).toBe(size)
        expect(icon.buffer.length).toBe(size * size * 4)
      }
    }
  })

  it('never draws outside the canvas', () => {
    const icon = renderTrayIcon('88', { size: 16, fg: FG })
    expect(icon.buffer.length).toBe(16 * 16 * 4)
  })
})

describe('renderTrayIcon — legibility at the real 16px tray size', () => {
  it('renders two distinct digits differently (0 vs 3 must not collide)', () => {
    const zero = renderTrayIcon('00', { size: 16, fg: FG })
    const three = renderTrayIcon('03', { size: 16, fg: FG })
    expect(Buffer.compare(zero.buffer, three.buffer)).not.toBe(0)
  })

  it('draws foreground pixels for a digit', () => {
    const icon = renderTrayIcon('8', { size: 16, fg: FG })
    const lit = [...icon.buffer].filter((_, i) => i % 4 === 3 && icon.buffer[i] === 255).length
    expect(lit).toBeGreaterThan(0)
  })

  it('leaves unknown characters blank instead of throwing', () => {
    expect(() => renderTrayIcon('?', { size: 16, fg: FG })).not.toThrow()
    const icon = renderTrayIcon('?', { size: 16, fg: FG })
    for (let i = 3; i < icon.buffer.length; i += 4) expect(icon.buffer[i]).toBe(0)
  })

  it('handles an empty string without throwing', () => {
    expect(() => renderTrayIcon('', { size: 16, fg: FG })).not.toThrow()
  })
})

describe('renderTrayIcon — accent bar', () => {
  it('paints the bottom rows with the accent color, stored as BGRA', () => {
    // The literal byte order is asserted on purpose: Chromium bitmaps are
    // BGRA_8888, and writing RGBA instead rendered Claude's coral accent
    // as blue on screen. Hardcoding the expected bytes keeps a future
    // "fix" back to RGBA from silently regressing the color.
    const size = 16
    const icon = renderTrayIcon('03', { size, fg: FG, accent: ACCENT })
    const expectedBgra = [ACCENT[2], ACCENT[1], ACCENT[0], ACCENT[3]]
    expect(pixelAt(icon, 0, size - 1)).toEqual(expectedBgra)
    expect(pixelAt(icon, size - 1, size - 1)).toEqual(expectedBgra)
  })

  it('leaves the bottom transparent when no accent is given', () => {
    const size = 16
    const icon = renderTrayIcon('03', { size, fg: FG })
    expect(pixelAt(icon, 0, size - 1)[3]).toBe(0)
  })
})

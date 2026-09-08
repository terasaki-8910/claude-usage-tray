/**
 * A hand-rolled 5x7 monospace bitmap font for digits and '-', used to draw
 * the Windows tray icon's live percentage numeral. Zero dependencies on
 * purpose: pulling in a canvas/Skia library just to draw two digits would
 * add a native binary (packaging risk, `asarUnpack`) and resident memory
 * that directly fight this app's memory-frugality requirement. macOS gets
 * the equivalent via `Tray.setTitle`, which needs no rasterization at all.
 */

const GLYPH_WIDTH = 5
const GLYPH_HEIGHT = 7
const GLYPH_GAP = 1

const FONT: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000']
}

export type RgbaColor = readonly [number, number, number, number]

export interface RenderedIcon {
  width: number
  height: number
  /** RGBA8888, row-major top-to-bottom — the layout `nativeImage.createFromBuffer` expects with `{width, height}`. */
  buffer: Buffer
}

export interface RenderOptions {
  /** Integer upscale factor from the native 5x7 grid, e.g. `Math.round((16 * scaleFactor) / GLYPH_HEIGHT)`. */
  scale: number
  fg: RgbaColor
  bg: RgbaColor
}

/** Renders a short string (digits and '-') into an RGBA buffer. Unknown
 * characters render as a blank cell rather than throwing — this feeds a
 * tray icon on a timer, so it must never crash the caller. */
export function renderGlyphs(text: string, opts: RenderOptions): RenderedIcon {
  const chars = text.split('')
  const cellW = GLYPH_WIDTH * opts.scale
  const cellH = GLYPH_HEIGHT * opts.scale
  const gap = GLYPH_GAP * opts.scale
  const width = chars.length > 0 ? chars.length * cellW + (chars.length - 1) * gap : cellW
  const height = cellH
  const buffer = Buffer.alloc(width * height * 4)

  const setPixel = (x: number, y: number, color: RgbaColor): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const idx = (y * width + x) * 4
    buffer[idx] = color[0]
    buffer[idx + 1] = color[1]
    buffer[idx + 2] = color[2]
    buffer[idx + 3] = color[3]
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) setPixel(x, y, opts.bg)
  }

  chars.forEach((ch, charIndex) => {
    const glyph = FONT[ch]
    if (!glyph) return
    const originX = charIndex * (cellW + gap)
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        if (glyph[row][col] !== '1') continue
        for (let sy = 0; sy < opts.scale; sy++) {
          for (let sx = 0; sx < opts.scale; sx++) {
            setPixel(originX + col * opts.scale + sx, row * opts.scale + sy, opts.fg)
          }
        }
      }
    }
  })

  return { width, height, buffer }
}

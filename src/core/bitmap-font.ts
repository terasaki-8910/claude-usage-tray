/**
 * Hand-rolled bitmap glyphs for the Windows tray icon's live percentage.
 * Zero dependencies on purpose: a canvas/Skia library would add a native
 * binary (packaging risk, `asarUnpack`) and resident memory just to draw
 * two digits. macOS gets the equivalent free via `Tray.setTitle`.
 *
 * HARD CONSTRAINT: the Windows tray slot is square and small —
 * `GetSystemMetrics(SM_CXSMICON)` is 16 at 100% DPI (verified on the
 * target machine). Anything non-square handed to `tray.setImage` is
 * rescaled to fit that square, which distorts glyphs badly: an earlier
 * 22x14 render was squashed to 16x16 and "03" became an unreadable blob
 * that read as "00". So every render here produces a SQUARE canvas of
 * exactly the requested size, and the glyph metrics are chosen to fit it
 * without any rescaling.
 *
 * At 16x16 there is only room for one legible thing. Two digits at 3x7
 * scaled 2x fill 14x14, leaving 2 rows for a brand accent bar — a Claude
 * logo AND readable digits do not both fit at this size.
 */

const GLYPH_W = 3
const GLYPH_H = 7
const GLYPH_GAP = 1

/** 3x7 seven-segment-style digits — chosen over a 5x7 face because two
 * 5-wide glyphs cannot fit a 16px square without rescaling. */
const FONT: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '010', '010', '111'],
  '2': ['111', '001', '001', '111', '100', '100', '111'],
  '3': ['111', '001', '001', '111', '001', '001', '111'],
  '4': ['101', '101', '101', '111', '001', '001', '001'],
  '5': ['111', '100', '100', '111', '001', '001', '111'],
  '6': ['111', '100', '100', '111', '101', '101', '111'],
  '7': ['111', '001', '001', '010', '010', '010', '010'],
  '8': ['111', '101', '101', '111', '101', '101', '111'],
  '9': ['111', '101', '101', '111', '001', '001', '111'],
  '-': ['000', '000', '000', '111', '000', '000', '000']
}

export type RgbaColor = readonly [number, number, number, number]

export interface RenderedIcon {
  width: number
  height: number
  /** RGBA8888, row-major top-to-bottom — the layout `nativeImage.createFromBuffer` expects with `{width, height}`. */
  buffer: Buffer
}

export interface TrayIconOptions {
  /** Square canvas edge length in px, e.g. `16 * scaleFactor`. */
  size: number
  /** Digit color — carries the severity signal. */
  fg: RgbaColor
  /** Optional 2px bar along the bottom edge — a persistent brand cue that
   * costs no digit legibility. Omit to draw digits only. */
  accent?: RgbaColor
}

class Canvas {
  readonly buffer: Buffer

  constructor(
    readonly size: number,
    fill: RgbaColor
  ) {
    this.buffer = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) this.set(x, y, fill)
    }
  }

  set(x: number, y: number, c: RgbaColor): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return
    const i = (y * this.size + x) * 4
    // Written as BGRA, not RGBA: Chromium's bitmaps (and therefore
    // `nativeImage.createFromBuffer`) are BGRA_8888. Writing RGBA here
    // rendered Claude's coral accent bar as blue — green survived the
    // swap unnoticed because it is the middle channel either way.
    this.buffer[i] = c[2]
    this.buffer[i + 1] = c[1]
    this.buffer[i + 2] = c[0]
    this.buffer[i + 3] = c[3]
  }

  fillRect(x0: number, y0: number, w: number, h: number, c: RgbaColor): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) this.set(x, y, c)
    }
  }
}

const TRANSPARENT: RgbaColor = [0, 0, 0, 0]

/**
 * Renders up to 2 characters (digits or '-') centered in a square canvas,
 * with an optional 2px accent bar along the bottom. Unknown characters
 * render blank rather than throwing — this feeds a tray icon on a timer
 * and must never crash the caller.
 */
export function renderTrayIcon(text: string, opts: TrayIconOptions): RenderedIcon {
  const size = Math.max(8, Math.floor(opts.size))
  const canvas = new Canvas(size, TRANSPARENT)

  const accentH = opts.accent ? Math.max(1, Math.round(size / 8)) : 0
  const textAreaH = size - accentH

  const chars = text.slice(0, 2).split('')
  const baseW = chars.length * GLYPH_W + Math.max(0, chars.length - 1) * GLYPH_GAP

  // Largest integer scale that fits both axes without rescaling later.
  const scale = Math.max(1, Math.min(Math.floor(size / baseW), Math.floor(textAreaH / GLYPH_H)))

  const drawnW = baseW * scale
  const drawnH = GLYPH_H * scale
  const originX = Math.floor((size - drawnW) / 2)
  const originY = Math.floor((textAreaH - drawnH) / 2)

  chars.forEach((ch, idx) => {
    const glyph = FONT[ch]
    if (!glyph) return
    const gx = originX + idx * (GLYPH_W + GLYPH_GAP) * scale
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (glyph[row][col] !== '1') continue
        canvas.fillRect(gx + col * scale, originY + row * scale, scale, scale, opts.fg)
      }
    }
  })

  if (opts.accent && accentH > 0) {
    canvas.fillRect(0, size - accentH, size, accentH, opts.accent)
  }

  return { width: size, height: size, buffer: canvas.buffer }
}

/**
 * Draws a radial burst mark for the macOS menu bar.
 *
 * macOS is not subject to the 16x16 "one legible thing" constraint that
 * forces Windows to choose between a logo and digits: there the icon and
 * `Tray.setTitle` text sit side by side, so the mark can carry identity
 * while the title carries the number.
 *
 * Returned as a black + alpha template image — macOS inverts template
 * images automatically for light and dark menu bars, so it must not
 * carry its own colors.
 */
export function renderBurstMark(size: number): RenderedIcon {
  const canvas = new Canvas(size, TRANSPARENT)
  const black: RgbaColor = [0, 0, 0, 255]
  const c = (size - 1) / 2
  const inner = size * 0.14
  const outer = size * 0.46
  const thickness = Math.max(1, Math.round(size / 14))

  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    for (let r = inner; r <= outer; r += 0.25) {
      const x = c + dx * r
      const y = c + dy * r
      for (let ox = 0; ox < thickness; ox++) {
        for (let oy = 0; oy < thickness; oy++) {
          canvas.set(Math.round(x) + ox, Math.round(y) + oy, black)
        }
      }
    }
  }

  return { width: size, height: size, buffer: canvas.buffer }
}

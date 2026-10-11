// Small SVG vocabulary for the README diagrams, modelled on the AWS
// architecture-diagram convention: grouped boxes with a filled corner chip,
// square service tiles with a label underneath, numbered flow arrows.
//
// Colour carries one meaning only: a filled brand-coloured tile is an
// external technology, a grey tile is a module of this app. The single
// accent (Claude coral, same as the tray icon's bar) marks the free usage
// refresh path; the paid ping path is drawn dark and dashed.

const ICONS = require('./icons.cjs')

const T = {
  ink: '#17171a',
  ink2: '#3d3d43',
  ink3: '#626269',
  line: '#8e8e95',
  hair: '#dcdce0',
  panel: '#f6f6f7',
  white: '#ffffff',
  accent: '#d97757',
  module: '#4a4a52'
}

const FONT = `'Segoe UI', 'Yu Gothic UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif`
const MONO = `'Cascadia Mono', Consolas, 'SFMono-Regular', monospace`

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function brandColor(name) {
  return ICONS[name]?.color ?? T.module
}

function glyph(name, x, y, size, fill) {
  const ic = ICONS[name]
  if (!ic) throw new Error(`unknown icon: ${name}`)
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${ic.vb}"><path d="${ic.d}" fill="${fill}"/></svg>`
}

/** Service tile centred on (x, y). `color` defaults to the icon's brand
 * colour, or the neutral module grey for pictograms. `outline` draws a
 * data store (file) instead of a filled tile. `labelAt` moves the caption
 * off whichever side an arrow needs. */
function tile({ x, y, icon, color, label, sub = [], size = 52, inner, outline = false, labelAt = 'below' }) {
  const fill = color ?? brandColor(icon)
  const g = size * 0.58
  const r = `x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="9"`
  let out = outline ? `<rect ${r} fill="${T.white}" stroke="${T.line}" stroke-width="1.3"/>` : `<rect ${r} fill="${fill}"/>`
  out += inner ?? glyph(icon, x - g / 2, y - g / 2, g, outline ? T.ink2 : T.white)

  const lines = [
    ...(label ? [{ s: label, cls: 'tl' }] : []),
    ...[].concat(sub).map((s) => ({ s, cls: 'ts' }))
  ]
  const step = 15
  let lx = x
  let anchor = 'middle'
  let ty
  if (labelAt === 'below') ty = y + size / 2 + 18
  else if (labelAt === 'above') ty = y - size / 2 - 10 - (lines.length - 1) * step
  else {
    anchor = labelAt === 'right' ? 'start' : 'end'
    lx = labelAt === 'right' ? x + size / 2 + 10 : x - size / 2 - 10
    ty = y - ((lines.length - 1) * step) / 2 + 4
  }
  for (const { s, cls } of lines) {
    out += `<text x="${lx}" y="${ty}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`
    ty += step
  }
  return out
}

/** AWS-style group: outline box, filled chip in the top-left corner,
 * label beside it. */
function group({ x, y, w, h, label, icon, color = T.ink2, dashed = false, fill = 'none', extra = '' }) {
  const dash = dashed ? ' stroke-dasharray="6 4"' : ''
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${color}" stroke-width="1.3"${dash}/>`
  out += `<rect x="${x}" y="${y}" width="28" height="28" fill="${color}"/>`
  out += glyph(icon, x + 5, y + 5, 18, T.white)
  out += `<text x="${x + 38}" y="${y + 19}" class="gl">${esc(label)}</text>`
  out += extra
  return out
}

const KIND = {
  free: { color: T.accent, width: 2.2, dash: '' },
  ping: { color: T.ink2, width: 1.8, dash: ' stroke-dasharray="7 5"' },
  ui: { color: T.line, width: 1.4, dash: '' }
}

/** Polyline arrow through `pts`. Optional pill label and step badge. */
function arrow(pts, { kind = 'free', label, at, step, stepAt, both = false, anchor = 'middle' } = {}) {
  const k = KIND[kind]
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' ')
  const start = both ? ` marker-start="url(#m-${kind}-s)"` : ''
  let out = `<path d="${d}" fill="none" stroke="${k.color}" stroke-width="${k.width}"${k.dash} stroke-linejoin="round" marker-end="url(#m-${kind})"${start}/>`
  if (step !== undefined) {
    const [sx, sy] = stepAt ?? pts[0]
    out += badge(step, sx, sy, kind)
  }
  if (label) {
    const [lx, ly] = at
    const lines = [].concat(label)
    lines.forEach((line, i) => {
      out += `<text x="${lx}" y="${ly + i * 14}" class="al" text-anchor="${anchor}" data-pill="1">${esc(line)}</text>`
    })
  }
  return out
}

function badge(n, x, y, kind = 'free') {
  const fill = kind === 'free' ? T.accent : T.ink2
  return `<circle cx="${x}" cy="${y}" r="10" fill="${fill}" stroke="${T.white}" stroke-width="2"/><text x="${x}" y="${y + 4}" class="badge">${esc(n)}</text>`
}

/** Flowchart process step: icon tile + title + detail lines in a card.
 * (x, y) is the top-left corner. */
function card({ x, y, w, h, icon, color = T.module, title, detail = [] }) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${T.white}" stroke="${T.hair}" stroke-width="1.3"/>`
  const s = 36
  out += `<rect x="${x + 14}" y="${y + 14}" width="${s}" height="${s}" rx="7" fill="${color}"/>`
  out += glyph(icon, x + 14 + 7, y + 14 + 7, 22, T.white)
  let ty = y + 29
  out += `<text x="${x + 64}" y="${ty}" class="ct">${esc(title)}</text>`
  for (const line of [].concat(detail)) {
    ty += 17
    out += `<text x="${x + 64}" y="${ty}" class="cd">${esc(line)}</text>`
  }
  return out
}

function diamond({ cx, cy, w = 200, h = 84, lines }) {
  const pts = `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`
  let out = `<polygon points="${pts}" fill="${T.white}" stroke="${T.ink2}" stroke-width="1.4"/>`
  const ls = [].concat(lines)
  ls.forEach((s, i) => {
    const cls = i === 0 ? 'ct' : 'cd'
    out += `<text x="${cx}" y="${cy + 5 + (i - (ls.length - 1) / 2) * 16}" class="${cls}" text-anchor="middle">${esc(s)}</text>`
  })
  return out
}

function terminal({ cx, cy, w = 190, h = 40, label }) {
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${T.panel}" stroke="${T.line}" stroke-width="1.2"/><text x="${cx}" y="${cy + 5}" class="ct" text-anchor="middle">${esc(label)}</text>`
}

/** Plain note box with a title and lines. */
function note({ x, y, w, h, title, lines }) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${T.panel}" stroke="${T.hair}" stroke-width="1.2"/>`
  let ty = y + 21
  out += `<text x="${x + 12}" y="${ty}" class="ct">${esc(title)}</text>`
  for (const line of lines) {
    ty += 17
    out += `<text x="${x + 12}" y="${ty}" class="cd">${esc(line)}</text>`
  }
  return out
}

function text(x, y, s, cls = 'ts', anchor = 'start') {
  return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`
}

function markers() {
  const m = (id, color, start) => {
    const path = start ? 'M10 0 L0 5 L10 10 z' : 'M0 0 L10 5 L0 10 z'
    const ref = start ? 1 : 9
    return `<marker id="${id}" viewBox="0 0 10 10" refX="${ref}" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="${path}" fill="${color}"/></marker>`
  }
  return Object.entries(KIND)
    .map(([name, k]) => m(`m-${name}`, k.color, false) + m(`m-${name}-s`, k.color, true))
    .join('')
}

/** Wraps body markup into a standalone SVG document. */
function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${markers()}</defs>
<style>
  text { font-family: ${FONT}; }
  .tl { font-size: 12.5px; font-weight: 600; fill: ${T.ink}; }
  .ts { font-size: 11px; fill: ${T.ink3}; }
  .tsl { font-size: 11px; fill: ${T.ink3}; }
  .gl { font-size: 13px; font-weight: 600; fill: ${T.ink2}; }
  .al { font-size: 11px; font-weight: 500; fill: ${T.ink2}; }
  .badge { font-size: 11px; font-weight: 700; fill: ${T.white}; text-anchor: middle; }
  .h1 { font-size: 17px; font-weight: 700; fill: ${T.ink}; }
  .h2 { font-size: 13px; font-weight: 600; fill: ${T.ink2}; }
  .body { font-size: 12px; fill: ${T.ink2}; }
  .ct { font-size: 13px; font-weight: 600; fill: ${T.ink}; }
  .cd { font-size: 11.5px; fill: ${T.ink3}; }
  .mono { font-family: ${MONO}; font-size: 11px; fill: ${T.ink2}; }
</style>
<rect width="${w}" height="${h}" fill="${T.white}"/>
${body}
</svg>`
}

module.exports = { T, FONT, MONO, ICONS, esc, glyph, tile, group, arrow, badge, text, svgDoc, brandColor, card, diamond, terminal, note }

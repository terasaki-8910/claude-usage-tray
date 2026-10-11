// Renders the README images into docs/images/ with an offscreen Electron
// window at 2x, so text and icons stay sharp on high-DPI screens.
//
//   npm run docs:images                               # everything
//   npx electron docs/tools/render.cjs diagrams [name...]
//   npx electron docs/tools/render.cjs shots          # needs `npm run build`
//
// Diagrams and shots run as separate processes: creating a second
// offscreen window after a capture made the process exit silently, so each
// run sticks to a single window.
//
// The popup images load the real built renderer (out/renderer, so run
// `npm run build` first) and the tray images come from the real
// src/core/bitmap-font.ts — nothing here re-implements the app's UI.

const { app, BrowserWindow, nativeImage, nativeTheme, ipcMain } = require('electron')
const { writeFileSync, mkdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..', '..')
const OUT = join(ROOT, 'docs', 'images')
const SCALE = 2

// A throwaway profile: Chromium persists per-URL zoom levels and caches in
// the profile, and the default one is shared by every `electron <script>`
// run on this machine. Nothing from a render should outlive it.
const PROFILE = join(tmpdir(), 'usagetray-docs-render')
rmSync(PROFILE, { recursive: true, force: true })
app.setPath('userData', PROFILE)
app.disableHardwareAcceleration()

/** Compiles a TypeScript module from src/core on the fly (esbuild ships
 * with Vite), so the docs use exactly the code the app runs. */
function loadCore(rel) {
  const esbuild = require(join(ROOT, 'node_modules', 'esbuild'))
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [join(ROOT, rel)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false
  })
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', outputFiles[0].text)(mod, mod.exports, require)
  return mod.exports
}

const font = loadCore('src/core/bitmap-font.ts')
const BRAND = [217, 119, 87, 255]
const SEVERITY = {
  normal: [64, 190, 105, 255],
  warning: [230, 160, 30, 255],
  critical: [235, 80, 70, 255],
  unknown: [150, 150, 150, 255]
}

/** The real 16x16 tray bitmap, as SVG rects (BGRA buffer → RGB). */
function trayIconRects(glyphs, fg, x0, y0, px) {
  const icon = font.renderTrayIcon(glyphs, { size: 16, fg, accent: BRAND })
  let out = ''
  for (let y = 0; y < icon.height; y++) {
    for (let x = 0; x < icon.width; x++) {
      const i = (y * icon.width + x) * 4
      const a = icon.buffer[i + 3]
      if (!a) continue
      const rgb = `rgb(${icon.buffer[i + 2]},${icon.buffer[i + 1]},${icon.buffer[i]})`
      out += `<rect x="${x0 + x * px}" y="${y0 + y * px}" width="${px}" height="${px}" fill="${rgb}"/>`
    }
  }
  return out
}

const ctx = {
  /** Tray tile content: the live icon for 65% at 2 svg-px per pixel. */
  trayIcon: (cx, cy) => trayIconRects('65', SEVERITY.normal, cx - 16, cy - 16, 2)
}

// Pill backgrounds behind arrow labels need real text metrics, so they are
// measured in the page rather than guessed in Node.
const PILL_SCRIPT = `
for (const t of document.querySelectorAll('text[data-pill]')) {
  const b = t.getBBox()
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r.setAttribute('x', b.x - 5); r.setAttribute('y', b.y - 2)
  r.setAttribute('width', b.width + 10); r.setAttribute('height', b.height + 4)
  r.setAttribute('rx', 4); r.setAttribute('fill', '#ffffff')
  t.parentNode.insertBefore(r, t)
}`

/** Sets the viewport and device scale through the DevTools protocol — a
 * plain BrowserWindow is clamped to the physical screen size, which is
 * smaller than some of these figures. */
async function emulate(wc, width, height, transparent) {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
  await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: SCALE, mobile: false })
  if (transparent) {
    await wc.debugger.sendCommand('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  }
}

async function screenshot(wc, width, height) {
  // The emulated viewport already is width x height; a `clip` on top of
  // the device-scale override double-applied the scale (4x, cropped).
  const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })
  return nativeImage.createFromBuffer(Buffer.from(data, 'base64'))
}

let pageSeq = 0

/** Loads a page, retrying once: in this offscreen setup a navigation right
 * after a capture occasionally fails with ERR_FAILED while Chromium
 * restarts its GPU process. */
async function load(win, file) {
  try {
    await win.loadFile(file)
  } catch {
    await new Promise((r) => setTimeout(r, 500))
    await win.loadFile(file)
  }
}

// One window for every static capture: creating a second offscreen window
// in the same process after a capture made the process exit silently.
let shared = null

async function capture(html, width, height, { transparent = false, settle = 300 } = {}) {
  shared ??= new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { offscreen: true } })
  const file = join(PROFILE, `page-${pageSeq++}.html`)
  writeFileSync(file, html)
  // Attach only after the first load: attaching the debugger to a blank,
  // never-navigated offscreen webContents crashed the process.
  await load(shared, file)
  await emulate(shared.webContents, width, height, transparent)
  await new Promise((r) => setTimeout(r, settle))
  return screenshot(shared.webContents, width, height)
}

async function renderSvg(name, svg) {
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/)
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}svg{display:block}</style>${svg}<script>${PILL_SCRIPT}</script>`
  const img = await capture(html, Number(w), Number(h))
  writeFileSync(join(OUT, `${name}.png`), img.toPNG())
  console.log(`docs/images/${name}.png  ${img.getSize().width}x${img.getSize().height}`)
}

async function renderDiagrams(only) {
  const diagrams = require('./diagrams.cjs')
  for (const [name, fn] of Object.entries(diagrams)) {
    if (only && !only.includes(name)) continue
    await renderSvg(name, fn(ctx))
  }
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true })
  const [what = 'diagrams', ...names] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
  try {
    if (what === 'diagrams') await renderDiagrams(names.length ? names : null)
    if (what === 'shots') {
      await require('./shots.cjs').renderShots({
        OUT,
        ROOT,
        PROFILE,
        font,
        SEVERITY,
        BRAND,
        nativeTheme,
        nativeImage,
        ipcMain,
        BrowserWindow,
        emulate,
        screenshot,
        load,
        loadCore
      })
    }
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  }
  app.quit()
})

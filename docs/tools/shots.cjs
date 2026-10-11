// Popup and tray images for the README, rendered from the real built
// renderer (out/renderer) and the real tray bitmap code. Only the data is
// supplied here: usage comes from this machine's ~/.claude.json via the
// app's own parser; the ping figures are a real 7-day window from the
// app's ledger (2026-09-21 18:00 to 09-28 18:00: 20 pings, $0.0260).

const { join } = require('node:path')
const { homedir } = require('node:os')
const { readFileSync, writeFileSync } = require('node:fs')

const POPUP_WIDTH = 320
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function baseState(parser) {
  const snap = parser.parseUsageFile(readFileSync(join(homedir(), '.claude.json'), 'utf8'))
  return {
    // Shown as "just fetched", which is what the running app displays:
    // it refreshes every 2 minutes and on every open.
    fetchedAtMs: Date.now() - 40_000,
    stale: false,
    session: parser.bucketToDto(snap.session),
    weeklyAll: parser.bucketToDto(snap.weeklyAll),
    weeklyFable: parser.bucketToDto(snap.weeklyFable),
    pingEnabled: true,
    lastPingSummary: '17:30:49 成功(反映確認済) $0.0007',
    pingStats: { count7d: 20, spend7dUsd: 0.026 },
    openAtLogin: true
  }
}

async function renderShots(env) {
  const { OUT, ROOT, PROFILE, font, SEVERITY, BRAND, nativeTheme, nativeImage, ipcMain, BrowserWindow, emulate, screenshot, load, loadCore } = env
  const parser = loadCore('src/core/usage-parser.ts')
  const base = baseState(parser)

  let current = base
  ipcMain.handle('shot:get-state', () => current)
  // Never settles within a capture, so the refresh spinner stays visible.
  ipcMain.handle('shot:refresh', () => new Promise((r) => setTimeout(() => r(current), 60_000)))
  // The real main process resizes the window to this; here the height is
  // measured directly instead (see popup()).
  ipcMain.on('shot:height', () => {})

  // One window for everything (see render.cjs on why not a second one).
  const win = new BrowserWindow({
    show: false,
    width: POPUP_WIDTH,
    height: 600,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      preload: join(__dirname, 'shot-preload.cjs'),
      sandbox: true,
      contextIsolation: true
    }
  })
  const wc = win.webContents
  const save = (name, img) => {
    writeFileSync(join(OUT, `${name}.png`), img.toPNG())
    console.log(`docs/images/${name}.png  ${img.getSize().width}x${img.getSize().height}`)
  }

  async function popup(name, { state = base, theme = 'light', interact } = {}) {
    current = state
    nativeTheme.themeSource = theme
    await load(win, join(ROOT, 'out', 'renderer', 'index.html'))
    await emulate(wc, POPUP_WIDTH, 600, true)
    // The first paint is the "読み込み中…" placeholder; wait for the real
    // content (the footer) before measuring, as the app's own resize does.
    let height = 0
    for (let i = 0; i < 50 && !height; i++) {
      height = await wc.executeJavaScript(`document.querySelector('.card footer') ? Math.ceil(document.body.getBoundingClientRect().height) : 0`)
      if (!height) await sleep(100)
    }
    if (!height) throw new Error(`${name}: popup content never rendered`)
    await emulate(wc, POPUP_WIDTH, height, true)
    if (interact) await interact()
    await sleep(400)
    save(name, await screenshot(wc, POPUP_WIDTH, height))
  }

  await popup('popup')
  await popup('popup-dark', { theme: 'dark' })

  // Real hover over the auto-ping "?" — the tooltip is CSS :hover, so this
  // is the same state a mouse produces.
  await popup('popup-tooltip', {
    interact: async () => {
      const { x, y } = await wc.executeJavaScript(`(() => {
        const r = document.querySelector('.ping-toggle .info-tip-trigger').getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })()`)
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    }
  })

  // Tray icons: the exact bitmaps the app hands to the OS, magnified.
  nativeTheme.themeSource = 'light'
  const icon = (glyphs, severity) => {
    const r = font.renderTrayIcon(glyphs, { size: 16, fg: SEVERITY[severity], accent: BRAND })
    return nativeImage.createFromBuffer(r.buffer, { width: r.width, height: r.height }).toDataURL()
  }
  const burst = font.renderBurstMark(32)
  const mac = nativeImage.createFromBuffer(burst.buffer, { width: 32, height: 32 }).toDataURL()
  const cells = [
    [icon('65', 'normal'), '65', 'normal'],
    [icon('82', 'warning'), '82', 'warning'],
    [icon('97', 'critical'), '97', 'critical'],
    [icon('--', 'unknown'), '--', '取得失敗 / 10分以上古い']
  ]
  const W = 700
  const H = 230
  const html = `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; overflow: hidden; background: #ffffff; }
    body { font-family: 'Segoe UI', 'Yu Gothic UI', sans-serif; color: #17171a; padding: 24px 28px; box-sizing: border-box; width: ${W}px; height: ${H}px; }
    .row { display: flex; gap: 22px; align-items: flex-start; }
    .cell { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .slot { width: 96px; height: 96px; border-radius: 10px; background: #f3f3f3; border: 1px solid #e2e2e5; display: grid; place-items: center; }
    img { width: 64px; height: 64px; image-rendering: pixelated; }
    .cap { font-size: 12px; color: #3d3d43; font-weight: 600; }
    .sub { font-size: 11px; color: #626269; }
    .sep { width: 1px; align-self: stretch; background: #e2e2e5; margin: 0 6px; }
    h { display: block; font-size: 12px; font-weight: 600; color: #626269; margin-bottom: 12px; }
  </style><body>
  <div class="row">
    <div><h>Windows トレイ(16×16 の実ピクセルを4倍表示)</h><div class="row">
      ${cells.map(([src, cap, sub]) => `<div class="cell"><div class="slot"><img src="${src}"></div><div class="cap">${cap}</div><div class="sub">${sub}</div></div>`).join('')}
    </div></div>
    <div class="sep"></div>
    <div><h>macOS</h><div class="cell"><div class="slot"><img src="${mac}"></div><div class="cap">65%</div><div class="sub">テンプレート画像 + 数字</div></div></div>
  </div></body>`
  const file = join(PROFILE, 'tray-icons.html')
  writeFileSync(file, html)
  await load(win, file)
  await emulate(wc, W, H, false)
  await sleep(300)
  save('tray-icons', await screenshot(wc, W, H))

  win.destroy()
}

module.exports = { renderShots }

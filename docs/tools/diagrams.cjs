// The README diagrams, as code. Coordinates are explicit on purpose: these
// are small, hand-laid-out figures, and explicit numbers make every arrow
// route reviewable in a diff. Rendered to PNG by render.cjs.

const { T, tile, group, arrow, text, glyph, svgDoc, brandColor, card, diamond, terminal, note } = require('./diagram-kit.cjs')

function legend(y, items) {
  let x = 40
  let out = ''
  for (const it of items) {
    if (it.line) {
      const k = { free: [T.accent, 2.2, ''], ping: [T.ink2, 1.8, ' stroke-dasharray="7 5"'], ui: [T.line, 1.4, ''] }[it.line]
      out += `<path d="M${x} ${y} L${x + 30} ${y}" stroke="${k[0]}" stroke-width="${k[1]}"${k[2]} marker-end="url(#m-${it.line})"/>`
      x += 40
    } else {
      const fill = it.tile === 'outline' ? T.white : it.tile
      const stroke = it.tile === 'outline' ? ` stroke="${T.line}" stroke-width="1.2"` : ''
      out += `<rect x="${x}" y="${y - 8}" width="16" height="16" rx="4" fill="${fill}"${stroke}/>`
      x += 24
    }
    out += text(x, y + 4, it.label, 'tsl')
    x += it.w
  }
  return out
}

/** System architecture: where each piece runs and how data moves. */
function architecture(ctx) {
  const W = 1280
  const H = 890
  const c1 = 262
  const c2 = 432
  const c3 = 602
  const cl = 868
  const an = 1148
  const r1 = 230
  const r2 = 372
  const r3 = 514
  const rr = 700
  let b = ''

  // Groups, outermost first.
  b += group({ x: 118, y: 24, w: 884, h: 800, label: 'ユーザーのPC(Windows / macOS)', icon: 'desktop_windows', color: T.ink2 })
  b += group({ x: 146, y: 64, w: 572, h: 736, label: 'UsageTray(Electron 44)', icon: 'electron', color: brandColor('electron') })
  b += group({ x: 170, y: 112, w: 524, h: 488, label: 'Main プロセス(Node.js)', icon: 'nodedotjs', color: brandColor('nodedotjs'), dashed: true })
  b += group({
    x: 170,
    y: 632,
    w: 524,
    h: 148,
    label: 'Renderer(Chromium sandbox)— ポップアップ表示中だけ存在',
    icon: 'web',
    color: brandColor('preact'),
    dashed: true
  })
  b += group({ x: 758, y: 112, w: 220, h: 488, label: 'Claude Code CLI', icon: 'claude', color: brandColor('claude'), dashed: true })
  b += group({ x: 1040, y: 112, w: 216, h: 488, label: 'Anthropic(クラウド)', icon: 'anthropic', color: brandColor('anthropic') })

  // Arrows go under the tiles' captions but over group outlines.
  // -- free refresh path (1-6)
  b += arrow([[c2 + 28, r1], [c3 - 30, r1]], { kind: 'free', step: 1, stepAt: [c2 + 52, r1] })
  b += arrow([[c3 + 28, r1], [cl - 30, r1]], { kind: 'free', step: 2, stepAt: [c3 + 50, r1], label: 'PTY: /usage → /exit', at: [735, r1 + 4] })
  b += arrow([[cl + 28, r1 - 10], [an - 30, r1 - 10]], { kind: 'free', step: 3, stepAt: [cl + 50, r1 - 10], label: '照会のみ・$0', at: [1012, r1 - 6] })
  b += arrow([[cl + 28, r1 + 12], [950, r1 + 12], [950, r2], [cl + 30, r2]], { kind: 'free', step: 4, stepAt: [950, r1 + 50], label: '書込み', at: [950, 334] })
  b += arrow([[cl - 28, r2], [c2 + 30, r2]], { kind: 'free', step: 5, stepAt: [cl - 50, r2], label: 'mtime が変わった時だけ再パース', at: [628, r2 + 4] })
  b += arrow([[c2 - 28, r2], [c1 + 30, r2]], { kind: 'free' })
  b += arrow([[347, r2], [347, r1 + 12], [c1 + 30, r1 + 12]], { kind: 'free', step: 6, stepAt: [347, r2 - 28], label: '表示更新', at: [347, 322] })

  // -- reactive ping path (7-10)
  b += arrow([[c2, r2 + 28], [c2, r3 - 30]], { kind: 'ping', step: 7, stepAt: [c2, r2 + 46], label: '枠が切れた?', at: [c2, 470] })
  b += arrow([[c2 + 28, r3], [c3 - 30, r3]], { kind: 'ping', step: 8, stepAt: [c2 + 48, r3], label: 'ガード通過時', at: [528, r3 + 4] })
  b += arrow([[c3 + 28, r3], [cl - 30, r3]], { kind: 'ping', step: 9, stepAt: [c3 + 48, r3], label: 'Haiku 4.5 / --safe-mode', at: [742, r3 + 4] })
  b += arrow([[cl + 28, r3], [an - 30, r3]], { kind: 'ping', step: 10, stepAt: [cl + 50, r3], label: '≈ $0.0016 / 回', at: [1018, r3 + 4] })
  b += arrow([[c1 + 30, r3], [c2 - 30, r3]], { kind: 'ping', both: true, label: '履歴', at: [347, r3 + 4] })

  // -- UI / IPC
  b += arrow([[90, r1], [c1 - 30, r1]], { kind: 'ui', label: 'クリック', at: [134, r1 - 10] })
  b += arrow([[c1 + 28, r1 - 12], [c2 - 30, r1 - 12]], { kind: 'ui', label: '即時更新', at: [347, r1 - 18] })
  b += arrow([[c1 - 28, r2], [190, r2], [190, rr - 10], [c1 - 30, rr - 10]], { kind: 'ui', label: '生成・push', at: [190, 616] })
  b += arrow([[c1 + 28, rr], [c2 - 30, rr]], { kind: 'ui', both: true, label: 'window.api', at: [347, rr + 4] })
  b += arrow([[c2, rr - 28], [c2, 604]], { kind: 'ui', label: 'IPC', at: [c2, 618] })
  b += arrow([[64, 300], [64, rr + 12], [c1 - 30, rr + 12]], { kind: 'ui', label: '操作', at: [64, 520] })

  // User (an actor, drawn as a bare glyph like the AWS "user" icon).
  b += glyph('person', 40, r1 - 26, 48, T.ink2)
  b += text(64, r1 + 40, 'ユーザー', 'tl', 'middle')

  // Main process
  b += tile({ x: c1, y: r1, label: 'Tray', sub: ['tray.ts', '使用率・色・ツールチップ'], inner: ctx.trayIcon(c1, r1, 52), color: T.module })
  b += tile({ x: c2, y: r1, icon: 'schedule', color: T.module, label: 'tick()', sub: ['2分ごと + クリック時', '重複呼び出しは合流'], labelAt: 'above' })
  b += tile({ x: c3, y: r1, icon: 'terminal', color: T.module, label: 'usage-refresh', sub: ['node-pty で対話起動', '$0・数秒で終了'] })
  b += tile({ x: c1, y: r2, icon: 'web_asset', color: T.module, label: 'PopupWindow', sub: ['開くたびに生成', '閉じたら destroy()'] })
  b += tile({ x: c2, y: r2, icon: 'data_object', color: T.module, label: 'UsageStore', sub: ['パース失敗時は', '直前の値を維持'], labelAt: 'above' })
  b += tile({ x: c1, y: r3, icon: 'database', color: T.module, label: 'ledger / config', sub: ['送信履歴は追記型 NDJSON', '設定は原子的に書き込み'] })
  b += tile({ x: c2, y: r3, icon: 'shield', color: T.module, label: 'decide + guards', sub: ['間隔・回数・金額・', '連続エラーで停止'] })
  b += tile({ x: c3, y: r3, icon: 'send', color: T.module, label: 'ping-executor', sub: ['引数は配列で渡す', '(シェルを経由しない)'], labelAt: 'above' })

  // Renderer
  b += tile({ x: c1, y: rr, icon: 'preact', label: 'ポップアップUI', sub: ['Preact 10'] })
  b += tile({ x: c2, y: rr, icon: 'lock', color: T.module, label: 'preload', sub: ['contextBridge(CJS)'] })

  // Claude Code CLI
  b += tile({ x: cl, y: r1, icon: 'claude', label: '対話モード', sub: ['/usage を表示して終了', 'モデル呼び出しなし'] })
  b += tile({ x: cl, y: r2, icon: 'description', outline: true, label: '~/.claude.json', sub: ['cachedUsageUtilization'] })
  b += tile({ x: cl, y: r3, icon: 'claude', label: 'claude --print', sub: ['effort low・ツール無効', '予算上限 $0.02'] })

  // Anthropic
  b += tile({ x: an, y: r1, icon: 'anthropic', label: '使用状況', sub: ['セッション / 週間の枠'] })
  b += tile({ x: an, y: r3, icon: 'anthropic', label: 'Messages', sub: ['claude-haiku-4-5', '"Reply with just OK."'] })

  b += legend(H - 34, [
    { line: 'free', label: '無料の使用量リフレッシュ(2分ごと・クリック時)', w: 290 },
    { line: 'ping', label: '自動ping(枠が切れた時だけ・既定OFF)', w: 250 },
    { line: 'ui', label: 'UI操作 / IPC', w: 120 },
    { tile: T.module, label: 'このアプリのモジュール', w: 160 },
    { tile: brandColor('electron'), label: '外部の技術・サービス', w: 150 },
    { tile: 'outline', label: 'ファイル', w: 60 }
  ])

  return svgDoc(W, H, b)
}

/** One tick, top to bottom: the free refresh, then the paid-ping decision. */
function flow() {
  const W = 880
  const H = 1390
  const cx = 385
  const cardX = 150
  const cardW = 470
  let b = ''

  // Triggers merge into one call.
  const trig = [
    { x: 225, icon: 'schedule', label: '2分タイマー' },
    { x: cx, icon: 'mouse', label: 'トレイをクリック' },
    { x: 545, icon: 'refresh', label: '更新ボタン' }
  ]
  b += `<path d="M225 122 L225 150 L545 150 L545 122" fill="none" stroke="${T.accent}" stroke-width="2.2"/>`
  b += arrow([[cx, 122], [cx, 208]], { kind: 'free' })
  for (const t of trig) b += tile({ x: t.x, y: 58, size: 44, icon: t.icon, color: T.module, label: t.label })

  // A: free refresh
  b += group({ x: 110, y: 170, w: 730, h: 456, label: '使用量リフレッシュ — 無料($0)', icon: 'sync', color: T.accent, dashed: true })
  b += card({ x: cardX, y: 212, w: cardW, h: 74, icon: 'merge', title: 'dedupeInFlight で合流', detail: ['更新中なら新しく起動せず、実行中の Promise の結果を待つ', '(タイマーとクリックが重なっても古い値のまま終わらない)'] })
  b += arrow([[cx, 286], [cx, 310]], { kind: 'free' })
  b += card({ x: cardX, y: 312, w: cardW, h: 92, icon: 'terminal', title: 'node-pty で claude を対話モード起動', detail: ['初回だけ「このフォルダを信頼」に自動で応答', '/usage → 「Current session」の描画を待つ → /exit', 'モデル呼び出しなし($0)・20秒でタイムアウト'] })
  b += arrow([[cx, 404], [cx, 428]], { kind: 'free' })
  b += card({ x: cardX, y: 430, w: cardW, h: 74, icon: 'description', title: '~/.claude.json を stat', detail: ['mtime が変わった時だけパース', '想定外の構造なら直前の正常値を維持'] })
  b += arrow([[cx, 504], [cx, 528]], { kind: 'free' })
  b += card({ x: cardX, y: 530, w: cardW, h: 74, icon: 'widgets', title: 'トレイ・ツールチップを更新 / ポップアップへ push', detail: ['見た目が変わる時だけアイコンを再生成', '10分以上古いデータは「--」と警告表示に切り替え'] })

  // B: reactive ping
  b += arrow([[cx, 604], [cx, 698]], { kind: 'ping' })
  b += group({ x: 110, y: 656, w: 730, h: 700, label: '自動ping — 有料・既定OFF', icon: 'send', color: T.ink2, dashed: true })
  b += card({ x: cardX, y: 700, w: cardW, h: 74, icon: 'task_alt', title: '送信済み ping の反映を確認', detail: ['resetsAt が60秒以上動いたら「反映確認済」', '30分動かなければ「未確認」として打ち切り'] })
  b += arrow([[cx, 774], [cx, 796]], { kind: 'ping' })
  b += diamond({ cx, cy: 840, lines: ['自動ping が ON?'] })
  b += arrow([[cx, 882], [cx, 916]], { kind: 'ping', label: 'ON', at: [cx + 22, 903], anchor: 'start' })
  b += diamond({ cx, cy: 960, lines: ['枠が切れた?', 'resetsAt が過去・不明'] })
  b += arrow([[cx, 1002], [cx, 1036]], { kind: 'ping', label: 'はい', at: [cx + 22, 1023], anchor: 'start' })
  b += diamond({ cx, cy: 1080, lines: ['ガードを通過?'] })
  b += arrow([[cx, 1122], [cx, 1158]], { kind: 'ping', label: 'はい', at: [cx + 22, 1144], anchor: 'start' })
  b += card({ x: cardX, y: 1160, w: cardW, h: 74, icon: 'send', title: 'claude --print で1往復(Haiku 4.5)', detail: ['≈ $0.0016 / 回・1回あたりの予算上限 $0.02', '想定外のモデルが使われていたらエラー扱い'] })
  b += arrow([[cx, 1234], [cx, 1258]], { kind: 'ping' })
  b += card({ x: cardX, y: 1260, w: cardW, h: 74, icon: 'database', title: 'ledger.ndjson に記録', detail: ['次回以降の tick で反映を確認', 'ガード判定(回数・金額・連続エラー)の材料'] })
  // back to the confirmation step on a later tick
  b += arrow([[cardX, 1297], [124, 1297], [124, 737], [cardX - 2, 737]], { kind: 'ui', label: '次の tick', at: [124, 1010] })

  b += note({ x: 140, y: 1030, w: 136, h: 100, title: 'ガード', lines: ['前回から10分未満', '1時間に2回', '24時間で $1.00', '連続エラー3回'] })
  b += `<path d="M276 1080 L284 1080" stroke="${T.line}" stroke-width="1.2" stroke-dasharray="2 2"/>`

  // No-branches converge on one terminal.
  b += terminal({ cx: 725, cy: 960, label: '今回は送らない' })
  b += arrow([[cx + 100, 840], [725, 840], [725, 938]], { kind: 'ui', label: 'OFF', at: [560, 844] })
  b += arrow([[cx + 100, 960], [628, 960]], { kind: 'ui', label: 'いいえ', at: [560, 964] })
  b += arrow([[cx + 100, 1080], [725, 1080], [725, 982]], { kind: 'ui', label: 'いいえ', at: [560, 1084] })

  return svgDoc(W, H, b)
}

/** Small labelled pill (a process, a CI step). Widths are explicit:
 * text can't be measured on the Node side. */
function chip(x, y, w, label, { hl = false, mono = false, h = 26 } = {}) {
  const stroke = hl ? T.accent : T.hair
  const fill = hl ? '#fbefea' : T.panel
  const cls = mono ? 'mono' : 'cd'
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/><text x="${x + w / 2}" y="${y + h / 2 + 4}" class="${cls}" text-anchor="middle">${label}</text>`
}

/** Frameworks by layer, and the tag-to-release pipeline. */
function stack() {
  const W = 1280
  const H = 700
  let b = text(24, 42, '技術スタック', 'h1')

  const bands = [
    ['UI', [
      { icon: 'preact', label: 'Preact 10.29', sub: 'ポップアップUI' },
      { icon: 'tune', color: T.module, label: 'CSS カスタムプロパティ', sub: 'ライト / ダーク両対応' }
    ]],
    ['デスクトップ', [
      { icon: 'electron', label: 'Electron 44', sub: 'Tray・BrowserWindow・IPC' },
      { icon: 'nodedotjs', label: 'Node.js', sub: 'Main プロセス' },
      { icon: 'lock', color: T.module, label: 'sandbox + contextIsolation', sub: 'preload は CJS で出力' }
    ]],
    ['CLI 連携', [
      { icon: 'terminal', color: T.module, label: 'node-pty 1.1', sub: 'N-API prebuilt・asarUnpack' },
      { icon: 'claude', label: 'Claude Code CLI', sub: '/usage(無料)と --print' }
    ]],
    ['言語・ビルド', [
      { icon: 'typescript', label: 'TypeScript 7', sub: 'main / web で設定を分離' },
      { icon: 'vite', label: 'electron-vite 5 + Vite 7', sub: 'main / preload / renderer' }
    ]],
    ['テスト', [
      { icon: 'vitest', label: 'Vitest 5', sub: 'src/core の純粋関数 89件' },
      { icon: 'rule', color: T.module, label: 'tsc --noEmit', sub: 'CI で型検査' }
    ]],
    ['配布', [
      { icon: 'electronbuilder', label: 'electron-builder 26', sub: 'afterPack で ad-hoc 署名' },
      { icon: 'windows', label: 'Windows x64', sub: 'NSIS インストーラ' },
      { icon: 'apple', label: 'macOS arm64 / x64', sub: 'dmg + zip(未公証)' }
    ]]
  ]
  bands.forEach(([name, items], i) => {
    const y = 64 + i * 102
    b += `<rect x="24" y="${y}" width="800" height="90" rx="8" fill="${T.panel}"/>`
    b += text(44, y + 50, name, 'ct')
    items.forEach((it, j) => {
      b += tile({ x: 186 + j * 215, y: y + 45, size: 44, labelAt: 'right', ...it })
    })
  })

  // Release pipeline
  b += group({ x: 860, y: 24, w: 396, h: 636, label: 'GitHub', icon: 'github', color: brandColor('github') })
  b += tile({ x: 912, y: 96, size: 44, icon: 'sell', color: T.module, label: 'git tag v* を push', sub: 'タグをトリガーに起動', labelAt: 'right' })
  b += arrow([[912, 120], [912, 148]], { kind: 'ui' })
  b += group({ x: 880, y: 150, w: 356, h: 282, label: 'build(matrix・並列)', icon: 'githubactions', color: brandColor('githubactions'), dashed: true })
  const lanes = [
    { x: 894, icon: 'windows', os: 'windows-latest' },
    { x: 1068, icon: 'apple', os: 'macos-latest' }
  ]
  const steps = ['npm ci', 'typecheck', 'test', 'build', 'electron-builder', 'upload-artifact']
  for (const lane of lanes) {
    b += glyph(lane.icon, lane.x + 2, 188, 16, T.ink2)
    b += text(lane.x + 24, 201, lane.os, 'mono')
    steps.forEach((s, i) => {
      const y = 214 + i * 34
      b += chip(lane.x, y, 160, s, { mono: true })
      if (i) b += `<path d="M${lane.x + 80} ${y - 8} L${lane.x + 80} ${y}" stroke="${T.line}" stroke-width="1.2"/>`
    })
    b += arrow([[lane.x + 80, 410], [lane.x + 80, 468]], { kind: 'ui' })
  }
  b += card({ x: 880, y: 470, w: 356, h: 74, icon: 'rocket_launch', color: T.module, title: 'publish(ubuntu-latest)', detail: ['gh release create を1回だけ実行', '(並列ジョブが draft を2つ作る競合を解消)'] })
  b += arrow([[912, 544], [912, 586]], { kind: 'ui' })
  b += tile({ x: 912, y: 610, size: 44, icon: 'download', color: brandColor('github'), label: 'GitHub Releases', sub: 'Setup.exe / .dmg / .zip', labelAt: 'right' })

  return svgDoc(W, H, b)
}

/** Why idle memory stays low: the popup's renderer exists only while open. */
function lifecycle(ctx) {
  const W = 1280
  const H = 440
  let b = ''

  const procs = (x, y, withRenderer) => {
    let out = text(x, y - 10, 'プロセス', 'cd')
    out += chip(x, y, 124, 'Browser(Main)')
    out += chip(x + 132, y, 56, 'GPU')
    out += chip(x + 196, y, 84, 'Network')
    if (withRenderer) out += chip(x + 288, y, 92, 'Renderer', { hl: true })
    return out
  }

  b += group({ x: 40, y: 40, w: 440, h: 300, label: '待機中 — ほとんどの時間', icon: 'schedule', color: T.ink2 })
  b += tile({ x: 100, y: 130, label: 'トレイアイコンだけ', sub: ['BrowserWindow を持たない', '更新時だけ claude を数秒起動'], labelAt: 'right', inner: ctx.trayIcon(100, 130, 52), color: T.module })
  b += procs(64, 240, false)
  b += text(64, 312, '3プロセス', 'ct')

  b += group({ x: 800, y: 40, w: 440, h: 300, label: 'ポップアップ表示中', icon: 'web_asset', color: T.ink2 })
  b += tile({ x: 860, y: 130, label: 'トレイ + ポップアップ', sub: ['開くたびに BrowserWindow を生成', 'データは main から push'], labelAt: 'right', inner: ctx.trayIcon(860, 130, 52), color: T.module })
  b += procs(824, 240, true)
  b += text(824, 312, '4プロセス(Renderer は実測 Working Set 約74MB)', 'ct')

  b += arrow([[488, 150], [790, 150]], { kind: 'ui', label: ['トレイをクリック', 'new BrowserWindow(show: false)', '→ ready-to-show で表示'], at: [640, 104] })
  b += arrow([[790, 262], [488, 262]], { kind: 'ui', label: ['フォーカスが外れる / Esc / 再クリック', 'destroy()(hide ではなく破棄)'], at: [640, 230] })

  b += text(40, 380, 'macOS: Dock に出さない(app.dock.hide + LSUIElement)  ・  Windows: タスクバーに出さない(skipTaskbar)', 'body')
  b += text(40, 404, '計測: Windows 11 / Electron 44.2 で本番のレンダラーを読み込み、app.getAppMetrics() で比較(destroy 後は Renderer が消えて3プロセスに戻る)', 'cd')

  return svgDoc(W, H, b)
}

module.exports = { architecture, flow, stack, lifecycle }

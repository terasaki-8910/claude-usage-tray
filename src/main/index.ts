import { app, ipcMain } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bucketToDto } from '../core/usage-parser'
import { checkGuards } from '../core/budget-guard'
import { dedupeInFlight } from '../core/dedupe-in-flight'
import { bucketKeyForReason, reconcilePendingPings } from '../core/ping-confirm'
import { applySessionEstimate } from '../core/reset-estimate'
import { decide } from '../core/scheduler-logic'
import type { Config, LedgerEntry, PopupState } from '../core/types'
import { resolveClaudePath } from './claude-cli'
import { loadConfig, saveConfig } from './config-store'
import { Ledger } from './ledger'
import { runPing } from './ping-executor'
import { AppTray } from './tray'
import { refreshUsageViaInteractiveSession } from './usage-refresh'
import { UsageStore } from './usage-store'
import { PopupWindowManager } from './window-manager'

// Free (verified: interactive /usage renders "Total cost: $0.0000" — no
// model call happens), so this can run far more often than the old
// file-only poll. Still not instant-instant: each run boots a real
// claude process (~3-5s observed), so this is a floor on responsiveness,
// not a cost concern.
const REFRESH_INTERVAL_MS = 2 * 60_000
const REFRESH_SCRATCH_DIR = join(tmpdir(), 'usagetray-refresh-scratch')

let config: Config = loadConfig()
let tray: AppTray | null = null
let popup: PopupWindowManager | null = null
let usageStore: UsageStore
let ledger: Ledger
let pingInFlight = false

function summarizeLedgerEntry(e: LedgerEntry): string {
  const when = new Date(e.ts).toLocaleTimeString()
  if (e.status === 'in-flight') return `${when} 実行中…`
  const cost = e.costUsd !== null ? `$${e.costUsd.toFixed(4)}` : '不明'
  const outcome = e.isError ? 'エラー' : e.confirmed === true ? '成功(反映確認済)' : e.confirmed === false ? '成功(反映未確認)' : '成功(反映確認中)'
  return `${when} ${outcome} ${cost}`
}

function buildPopupState(): PopupState {
  const snap = usageStore.getSnapshot()
  const entries = ledger.getEntries()
  const last = entries[entries.length - 1] ?? null
  const weekAgo = Date.now() - 7 * 24 * 60 * 60_000
  const recent = entries.filter((e) => e.ts >= weekAgo)
  return {
    pingStats: {
      count7d: recent.length,
      spend7dUsd: recent.reduce((sum, e) => sum + (e.costUsd ?? 0), 0)
    },
    fetchedAtMs: snap.fetchedAtMs,
    stale: snap.stale,
    session: applySessionEstimate(bucketToDto(snap.session), entries, Date.now()),
    weeklyAll: bucketToDto(snap.weeklyAll),
    weeklyFable: bucketToDto(snap.weeklyFable),
    pingEnabled: config.pingEnabled,
    lastPingSummary: last ? summarizeLedgerEntry(last) : null,
    // Read live from the OS rather than mirrored into config.json — Electron
    // already persists this at the OS level (registry Run key on Windows,
    // a login-item entry on macOS), so a second copy could only drift.
    openAtLogin: app.getLoginItemSettings().openAtLogin
  }
}

async function firePing(reason: string): Promise<void> {
  const claudePath = resolveClaudePath()
  const ts = Date.now()
  const beforeBucket = usageStore.getSnapshot()[bucketKeyForReason(reason)]

  if (!claudePath) {
    ledger.append({
      ts,
      status: 'error',
      reason,
      costUsd: null,
      isError: true,
      subtype: 'claude-not-found',
      resetsAtBeforeMs: beforeBucket?.resetsAt?.getTime() ?? null,
      resetsAtAfterMs: null,
      confirmed: false
    })
    popup?.pushState()
    return
  }

  pingInFlight = true
  ledger.append({
    ts,
    status: 'in-flight',
    reason,
    costUsd: null,
    isError: null,
    subtype: null,
    resetsAtBeforeMs: beforeBucket?.resetsAt?.getTime() ?? null,
    resetsAtAfterMs: null,
    confirmed: null
  })
  popup?.pushState()

  const result = await runPing(claudePath, config.perPingCapUsd)
  ledger.updateByTs(ts, {
    status: result.isError ? 'error' : 'success',
    costUsd: result.costUsd,
    isError: result.isError,
    subtype: result.subtype
  })
  pingInFlight = false
  popup?.pushState()
  // No follow-up polling loop here: confirmation happens opportunistically
  // in tick(), whenever the snapshot next actually changes — see
  // reconcilePendingPings for why a fixed poll-and-give-up window doesn't
  // work for this cache.
}

/**
 * Sends one ping on explicit user request. Skips the "has a window
 * lapsed?" test and the pingEnabled switch — the user asked for this
 * specific send — but still honours the spend, rate and circuit-breaker
 * guards, which exist to stop runaway cost regardless of who asked.
 */
async function runPingNow(): Promise<{ ok: boolean; message: string }> {
  if (pingInFlight) return { ok: false, message: '送信中です' }

  const guard = checkGuards(ledger.getEntries(), config, Date.now())
  if (!guard.allowed) {
    const why: Record<string, string> = {
      debounced: '直前に送信済みのため待機中',
      'rate-limited': '1時間あたりの上限に達しています',
      'spend-ceiling': '1日の上限金額に達しています',
      'circuit-open': '連続エラーのため停止中'
    }
    return { ok: false, message: `送信しませんでした: ${why[guard.reason ?? ''] ?? guard.reason}` }
  }

  await firePing('manual')

  const entries = ledger.getEntries()
  const entry = entries[entries.length - 1]
  if (!entry) return { ok: false, message: '記録に失敗しました' }
  if (entry.isError) {
    return { ok: false, message: `失敗: ${entry.subtype ?? '不明なエラー'}` }
  }
  return { ok: true, message: `送信しました ($${(entry.costUsd ?? 0).toFixed(4)})` }
}

/**
 * Drives the free interactive-`/usage` refresh (see usage-refresh.ts),
 * then re-reads the now-hopefully-fresh cache file. Wrapped in
 * dedupeInFlight so overlapping calls (periodic tick + a manual click
 * landing at the same moment) share the one in-flight run rather than
 * spawning two `claude` processes — and rather than the second caller
 * skipping its refresh entirely, which used to make a manual "今すぐ更新"
 * click complete near-instantly with unchanged data whenever it landed
 * during the background tick (see dedupe-in-flight.ts for the regression
 * test). Failure is silent by design — the file-only read this falls
 * back to, plus the session-reset estimate, are the existing degraded
 * path.
 */
const activeRefresh = dedupeInFlight(async (): Promise<void> => {
  const claudePath = resolveClaudePath()
  if (claudePath) {
    await refreshUsageViaInteractiveSession(claudePath, REFRESH_SCRATCH_DIR)
  }
})

async function tick(manual = false): Promise<void> {
  await activeRefresh()
  const { changed } = usageStore.refresh()
  const snap = usageStore.getSnapshot()
  tray?.update(snap)

  // Runs every tick, not only when the file just changed — the give-up
  // clause depends on elapsed wall-clock time, not on a change happening
  // right now, and needs to fire even if the cache never refreshes again.
  const patches = reconcilePendingPings(ledger.getEntries(), snap, Date.now())
  for (const { ts, patch } of patches) ledger.updateByTs(ts, patch)

  const decision = decide(snap, ledger.getEntries(), config, new Date())
  if (decision.ping && !pingInFlight) {
    await firePing(decision.reason)
  }
  if (changed || manual || patches.length > 0) {
    popup?.pushState()
  }
}

app.whenReady().then(() => {
  // Chromium only builds its accessibility tree on demand, which leaves
  // the popup's controls invisible to UI Automation. Opt in explicitly so
  // the UI can be driven by an automated check; off by default because it
  // costs render-side work for no benefit in normal use.
  if (process.env['CLAUDE_TRAY_A11Y'] === '1') {
    app.setAccessibilitySupportEnabled(true)
  }

  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  usageStore = new UsageStore()
  ledger = new Ledger()
  popup = new PopupWindowManager(buildPopupState)
  tray = new AppTray(
    () => {
      popup?.toggle(tray!.getBounds())
      // Pull fresh data the moment the user actually looks, rather than
      // waiting for the next scheduled tick — free, so no reason not to.
      void tick(true)
    },
    () => app.quit()
  )

  ipcMain.handle('get-state', () => buildPopupState())
  ipcMain.handle('refresh', async () => {
    await tick(true)
    return buildPopupState()
  })
  ipcMain.handle('set-ping-enabled', (_event, enabled: unknown) => {
    config = { ...config, pingEnabled: Boolean(enabled) }
    saveConfig(config)
    popup?.pushState()
  })
  ipcMain.handle('set-open-at-login', (_event, enabled: unknown) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) })
    popup?.pushState()
  })
  ipcMain.handle('run-ping-now', async () => {
    const result = await runPingNow()
    popup?.pushState()
    return result
  })
  ipcMain.handle('quit', () => {
    app.quit()
  })
  ipcMain.on('report-height', (event, height: unknown) => {
    if (typeof height === 'number' && Number.isFinite(height)) {
      popup?.resizeToContent(event.sender.id, height)
    }
  })

  void tick()
  setInterval(() => {
    void tick()
  }, REFRESH_INTERVAL_MS)
})

// Tray app: closing the (only ever ephemeral) popup must never quit the
// app — only the tray's "終了" menu item (app.quit()) should.
app.on('window-all-closed', () => {
  // Intentionally does nothing.
})

app.on('before-quit', () => {
  tray?.destroy()
  popup?.destroy()
})

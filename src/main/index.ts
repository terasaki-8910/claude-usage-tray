import { app, ipcMain } from 'electron'
import { bucketToDto } from '../core/usage-parser'
import { decide } from '../core/scheduler-logic'
import type { Config, LedgerEntry, PopupState } from '../core/types'
import { resolveClaudePath } from './claude-cli'
import { loadConfig, saveConfig } from './config-store'
import { Ledger } from './ledger'
import { runPing } from './ping-executor'
import { AppTray } from './tray'
import { UsageStore } from './usage-store'
import { PopupWindowManager } from './window-manager'

const REFRESH_INTERVAL_MS = 5 * 60_000
// Cache refresh was measured to be asynchronous with unknown latency after
// a ping — poll a few times rather than assuming it lands immediately.
const CONFIRM_POLL_DELAYS_MS = [15_000, 30_000, 60_000, 120_000]

let config: Config = loadConfig()
let tray: AppTray | null = null
let popup: PopupWindowManager | null = null
let usageStore: UsageStore
let ledger: Ledger
let pingInFlight = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function summarizeLedgerEntry(e: LedgerEntry): string {
  const when = new Date(e.ts).toLocaleTimeString()
  if (e.status === 'in-flight') return `${when} 実行中…`
  const cost = e.costUsd !== null ? `$${e.costUsd.toFixed(4)}` : '不明'
  const outcome = e.isError ? 'エラー' : e.confirmed ? '成功(確認済)' : '成功(未確認)'
  return `${when} ${outcome} ${cost}`
}

function buildPopupState(): PopupState {
  const snap = usageStore.getSnapshot()
  const entries = ledger.getEntries()
  const last = entries[entries.length - 1] ?? null
  return {
    fetchedAtMs: snap.fetchedAtMs,
    stale: snap.stale,
    session: bucketToDto(snap.session),
    weeklyAll: bucketToDto(snap.weeklyAll),
    weeklyFable: bucketToDto(snap.weeklyFable),
    pingEnabled: config.pingEnabled,
    lastPingSummary: last ? summarizeLedgerEntry(last) : null
  }
}

async function firePing(reason: string): Promise<void> {
  const claudePath = resolveClaudePath()
  const ts = Date.now()
  const beforeBucket = reason === 'session' ? usageStore.getSnapshot().session : usageStore.getSnapshot().weeklyAll

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

  void confirmPing(ts, reason)
}

/** Polls after a ping to confirm resetsAt actually moved — refresh was
 * measured to be asynchronous with unknown latency, so this does not
 * assume the cache is fresh the instant the CLI process exits. */
async function confirmPing(ts: number, reason: 'session' | string): Promise<void> {
  const entry = ledger.getEntries().find((e) => e.ts === ts)
  const beforeMs = entry?.resetsAtBeforeMs ?? null

  for (const delay of CONFIRM_POLL_DELAYS_MS) {
    await sleep(delay)
    const { changed } = usageStore.refresh()
    if (!changed) continue
    const snap = usageStore.getSnapshot()
    const after = reason === 'session' ? snap.session : snap.weeklyAll
    const afterMs = after?.resetsAt?.getTime() ?? null
    const moved = afterMs !== null && afterMs !== beforeMs
    ledger.updateByTs(ts, { resetsAtAfterMs: afterMs, confirmed: moved })
    tray?.update(snap)
    popup?.pushState()
    if (moved) return
  }
  ledger.updateByTs(ts, { confirmed: false })
  popup?.pushState()
}

async function tick(manual = false): Promise<void> {
  const { changed } = usageStore.refresh()
  const snap = usageStore.getSnapshot()
  tray?.update(snap)

  const decision = decide(snap, ledger.getEntries(), config, new Date())
  if (decision.ping && !pingInFlight) {
    await firePing(decision.reason)
  }
  if (changed || manual) {
    popup?.pushState()
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  usageStore = new UsageStore()
  ledger = new Ledger()
  popup = new PopupWindowManager(buildPopupState)
  tray = new AppTray(
    () => popup?.toggle(tray!.getBounds()),
    () => app.quit()
  )

  ipcMain.handle('refresh', async () => {
    await tick(true)
  })
  ipcMain.handle('set-ping-enabled', (_event, enabled: unknown) => {
    config = { ...config, pingEnabled: Boolean(enabled) }
    saveConfig(config)
    popup?.pushState()
  })
  ipcMain.handle('quit', () => {
    app.quit()
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

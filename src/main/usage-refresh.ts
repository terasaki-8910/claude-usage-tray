import * as pty from 'node-pty'
import { mkdirSync } from 'node:fs'

/**
 * Forces a fresh read of `cachedUsageUtilization` by driving a real
 * interactive `claude` session through `/usage` and exiting.
 *
 * Why this exists: `claude -p` (any flags, including `--safe-mode`,
 * `--no-session-persistence`) was measured to leave the cache untouched
 * for 6.75+ hours even under continuous heavy use. Driving `/usage`
 * through a real PTY, by contrast, refreshes it immediately — verified
 * directly: `fetchedAtMs` changed and the resulting numbers (55% session,
 * "Resets 5:30pm") matched the interactive screen exactly. `/usage`
 * itself is free: the screen it renders shows "Total cost: $0.0000,
 * 0 input, 0 output" — it's a local account-status query, not a message
 * to the model. This does NOT extend the session window (see
 * ping-executor.ts for that) — it only lets the app observe the real
 * current state instead of guessing.
 *
 * A "trust this folder" prompt appears on the first-ever interactive
 * launch from a given directory and never again afterward (Claude Code
 * persists the decision) — confirmed by running twice from the same
 * scratch directory. Always reusing SCRATCH_DIR keeps this a one-time
 * cost, not a per-refresh one.
 */

export interface RefreshResult {
  ok: boolean
  error?: string
}

const BOOT_IDLE_MS = 1200
const POLL_INTERVAL_MS = 300
const HARD_TIMEOUT_MS = 20_000

function stripEscapes(s: string): string {
  // Only used for keyword detection, never for parsing values — this is
  // deliberately lossy (collapses cursor-advance-positioned spaces), see
  // the raw-buffer note below.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

export function refreshUsageViaInteractiveSession(claudePath: string, scratchDir: string): Promise<RefreshResult> {
  try {
    mkdirSync(scratchDir, { recursive: true })
  } catch {
    // best-effort
  }

  return new Promise((resolve) => {
    let term: pty.IPty
    try {
      term = pty.spawn(claudePath, [], {
        name: 'xterm-color',
        cols: 120,
        rows: 40,
        cwd: scratchDir,
        env: process.env as Record<string, string>
      })
    } catch (e) {
      resolve({ ok: false, error: `spawn-failed: ${(e as Error).message}` })
      return
    }

    let buffer = ''
    let lastDataAt = Date.now()
    let stage: 'boot' | 'trust' | 'usage' | 'done' = 'boot'
    let settled = false

    const finish = (result: RefreshResult): void => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(hardTimeout)
      try {
        term.kill()
      } catch {
        // already gone
      }
      resolve(result)
    }

    term.onData((data) => {
      buffer += data
      lastDataAt = Date.now()
    })
    term.onExit(({ exitCode }) => {
      // Exiting during 'usage'/'done' is the expected path (we asked it
      // to via /exit); exiting earlier means something else happened
      // (e.g. the trust dialog's default "No, exit" got triggered).
      if (stage !== 'done') finish({ ok: false, error: `pty-exited-early: code ${exitCode}, stage ${stage}` })
    })

    const poll = setInterval(() => {
      const idleMs = Date.now() - lastDataAt
      if (idleMs < BOOT_IDLE_MS || buffer.length === 0) return

      if (stage === 'boot') {
        // Check the RAW buffer, not escape-stripped: this TUI positions
        // words via cursor-advance escapes rather than literal space
        // bytes, so stripping first can fuse "trust this folder" into
        // "trustthisfolder" and break a phrase match. A single keyword
        // survives either way.
        if (/trust/i.test(buffer)) {
          stage = 'trust'
          buffer = ''
          term.write('\x1b[B') // Down arrow, to "Yes, I trust this folder"
          setTimeout(() => term.write('\r'), 300)
        } else {
          stage = 'usage'
          buffer = ''
          term.write('/usage\r')
        }
      } else if (stage === 'trust') {
        stage = 'usage'
        buffer = ''
        term.write('/usage\r')
      } else if (stage === 'usage') {
        const text = stripEscapes(buffer)
        // Wait for the usage screen's own content, not just any idle
        // moment — it renders in a couple of incremental paints.
        if (!/Current session|Resets/i.test(text)) return
        stage = 'done'
        term.write('/exit\r')
        setTimeout(() => finish({ ok: true }), 800)
      }
    }, POLL_INTERVAL_MS)

    const hardTimeout = setTimeout(() => {
      finish({ ok: false, error: `timeout at stage ${stage}` })
    }, HARD_TIMEOUT_MS)
  })
}

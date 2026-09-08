import { readFileSync, statSync } from 'node:fs'
import type { Snapshot } from '../core/types'
import { parseUsageFile } from '../core/usage-parser'
import { getClaudeJsonPath } from './paths'

const EMPTY_SNAPSHOT: Snapshot = {
  fetchedAtMs: null,
  session: null,
  weeklyAll: null,
  weeklyFable: null,
  stale: true,
  raw: null
}

/**
 * Reads `.claude.json`'s usage-limit cache. Read-only, always — this file
 * belongs to the Claude Code CLI. `refresh()` is cheap to call often (a
 * 5-minute timer, a tray click) because it short-circuits on `mtimeMs`
 * before ever re-parsing.
 *
 * Deliberately does NOT use `fs.watch`: unreliable on Windows with
 * atomic-rename writes, and this file churns constantly from unrelated
 * Claude Code activity (history, per-project metadata) — a stat-based
 * poll avoids reacting to writes we don't care about.
 */
export class UsageStore {
  private lastMtimeMs = -1
  private snapshot: Snapshot = EMPTY_SNAPSHOT

  constructor(private readonly filePath: string = getClaudeJsonPath()) {}

  getSnapshot(): Snapshot {
    return this.snapshot
  }

  refresh(): { snapshot: Snapshot; changed: boolean } {
    try {
      const stat = statSync(this.filePath)
      if (stat.mtimeMs === this.lastMtimeMs) {
        return { snapshot: this.snapshot, changed: false }
      }
      const text = readFileSync(this.filePath, 'utf8')
      const parsed = parseUsageFile(text)
      this.lastMtimeMs = stat.mtimeMs
      if (parsed.stale) {
        // Torn read (the CLI rewrites this file wholesale) or an
        // unrecognized shape — keep the last-known-good snapshot rather
        // than flashing the UI to an empty/unknown state.
        return { snapshot: this.snapshot, changed: false }
      }
      this.snapshot = parsed
      return { snapshot: this.snapshot, changed: true }
    } catch {
      // File missing (Claude Code never run yet) or a transient read
      // error — keep the last-known-good snapshot.
      return { snapshot: this.snapshot, changed: false }
    }
  }
}

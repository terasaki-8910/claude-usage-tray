import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LedgerEntry } from '../core/types'
import { getLedgerPath } from './paths'

/** Guard checks (rate/spend/circuit-breaker) only need recent history —
 * bounding this keeps memory flat regardless of how long the app has run. */
const MAX_IN_MEMORY = 500

/**
 * Append-only ndjson ledger of ping attempts, with a bounded in-memory
 * mirror for fast guard checks. "Updating" an entry (e.g. once an
 * in-flight ping settles) appends a corrected record rather than rewriting
 * the file — `load()` dedupes by `ts`, keeping the *last* record seen for
 * each timestamp, so a restart never double-counts a corrected entry as
 * two separate pings.
 */
export class Ledger {
  private entries: LedgerEntry[] = []

  constructor(private readonly path: string = getLedgerPath()) {
    this.load()
  }

  private load(): void {
    if (!existsSync(this.path)) return
    try {
      const text = readFileSync(this.path, 'utf8')
      const lines = text.split('\n').filter((l) => l.trim().length > 0)
      const byTs = new Map<number, LedgerEntry>()
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LedgerEntry
          if (typeof entry.ts === 'number') byTs.set(entry.ts, entry)
        } catch {
          // skip a malformed line rather than failing the whole load
        }
      }
      this.entries = Array.from(byTs.values())
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_IN_MEMORY)
    } catch {
      this.entries = []
    }
  }

  getEntries(): readonly LedgerEntry[] {
    return this.entries
  }

  append(entry: LedgerEntry): void {
    this.entries.push(entry)
    if (this.entries.length > MAX_IN_MEMORY) {
      this.entries = this.entries.slice(-MAX_IN_MEMORY)
    }
    this.persist(entry)
  }

  /** Merges a patch into the most recent entry (by `ts`) and persists the
   * corrected record. Used to settle an in-flight ping and later to record
   * whether a follow-up poll confirmed resetsAt actually moved. */
  updateByTs(ts: number, patch: Partial<LedgerEntry>): void {
    const idx = this.entries.findIndex((e) => e.ts === ts)
    if (idx === -1) return
    const updated = { ...this.entries[idx], ...patch }
    this.entries[idx] = updated
    this.persist(updated)
  }

  private persist(entry: LedgerEntry): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      appendFileSync(this.path, `${JSON.stringify(entry)}\n`, 'utf8')
    } catch {
      // Best-effort: in-memory state still reflects reality for this run
      // even if the disk write failed (e.g. disk full).
    }
  }
}

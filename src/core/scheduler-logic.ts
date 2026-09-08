import type { Bucket, Config, LedgerEntry, PingDecision, Snapshot } from './types'
import { checkGuards } from './budget-guard'

/** A bucket needs a ping when its reset time is unknown or already past.
 * Deliberately does NOT look at `Bucket.isActive` — real captured data
 * shows a session bucket with a valid future resetsAt reported as
 * `is_active: false` (see the comment on that field in types.ts). Using
 * isActive here would falsely flag a healthy, freshly-anchored window as
 * needing a ping. A bucket we have never seen at all (null) is treated as
 * lapsed too — the bootstrap case, seeding data for the first time. */
function hasLapsed(bucket: Bucket | null, nowMs: number): boolean {
  if (!bucket) return true
  if (bucket.resetsAt === null) return true
  return nowMs >= bucket.resetsAt.getTime()
}

/**
 * Decides whether to fire a ping right now. Called every 5 minutes (and
 * on-demand from a tray click) alongside a fresh Snapshot read — this is
 * NOT a fixed clock schedule. A ping is recommended only when a window has
 * actually lapsed by wall-clock time, and only if it clears every safety
 * guard in budget-guard.ts.
 */
export function decide(snap: Snapshot, ledger: readonly LedgerEntry[], cfg: Config, now: Date): PingDecision {
  if (!cfg.pingEnabled) return { ping: false, reason: 'ping-disabled' }
  if (snap.stale) return { ping: false, reason: 'snapshot-stale' }

  const nowMs = now.getTime()
  const lapsedSession = hasLapsed(snap.session, nowMs)
  const lapsedWeekly = hasLapsed(snap.weeklyAll, nowMs)

  if (!lapsedSession && !lapsedWeekly) {
    return { ping: false, reason: 'nothing-lapsed' }
  }

  const guard = checkGuards(ledger, cfg, nowMs)
  if (!guard.allowed) {
    return { ping: false, reason: guard.reason ?? 'guarded' }
  }

  return { ping: true, reason: lapsedSession ? 'session' : 'weekly_all' }
}

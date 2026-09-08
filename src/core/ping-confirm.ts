import type { Bucket, LedgerEntry, Snapshot } from './types'

/**
 * Decides whether a ping actually restarted a usage window.
 *
 * This is the check that tells the user honestly whether the product's
 * premise holds, so a false positive here is worse than no check at all.
 * Observed in real data: the server returns the same reset instant with
 * slightly different sub-second precision on consecutive fetches
 * (…21:59:59.762Z then …21:59:59.788Z). A naive `before !== after`
 * treated that 26 ms of jitter as a restarted window and reported
 * "確認済".
 */

/** A genuine window restart moves the reset by hours; anything under a
 * minute is fetch-to-fetch noise. */
export const MIN_RESET_MOVE_MS = 60_000

/** Which bucket a ping should be measured against. Only a weekly-triggered
 * ping is judged on the weekly window; session and manual pings are judged
 * on the session window. A previous `reason === 'session' ? … : weeklyAll`
 * ternary silently sent every manual ping to the weekly bucket. */
export function bucketKeyForReason(reason: string): 'session' | 'weeklyAll' {
  return reason === 'weekly_all' ? 'weeklyAll' : 'session'
}

export function resetMoved(beforeMs: number | null, afterMs: number | null): boolean {
  if (afterMs === null) return false
  // No window existed before and one exists now — that is a restart.
  if (beforeMs === null) return true
  return Math.abs(afterMs - beforeMs) >= MIN_RESET_MOVE_MS
}

/**
 * How long to keep a ping's confirmation as "checking" before giving up
 * and showing an honest "not confirmed" rather than spinning forever.
 *
 * There is no fixed refresh interval to wait out: measured directly, the
 * local cache (`~/.claude.json`'s `cachedUsageUtilization`) went 20+
 * minutes without updating after two consecutive real, billed, successful
 * pings — with and without `--no-session-persistence`. A short
 * poll-and-give-up window (originally 15s–120s) reported "unconfirmed" on
 * data that simply had not been re-fetched yet, not on a failed ping.
 */
export const CONFIRM_GIVE_UP_AFTER_MS = 30 * 60_000

export interface LedgerPatch {
  ts: number
  patch: { confirmed: boolean; resetsAtAfterMs: number | null }
}

/**
 * Checks every not-yet-confirmed successful ping against a freshly read
 * snapshot. Call this whenever the snapshot actually changes (not on a
 * fixed timer) — confirmation happens opportunistically, whenever the
 * underlying cache next refreshes, however long that takes. An entry
 * already given up on (`confirmed: false`) can still be upgraded to
 * `true` later if the delayed cache eventually catches up; the reverse
 * never happens.
 */
export function reconcilePendingPings(
  entries: readonly LedgerEntry[],
  snapshot: Snapshot,
  nowMs: number,
  giveUpAfterMs: number = CONFIRM_GIVE_UP_AFTER_MS
): LedgerPatch[] {
  if (snapshot.stale) return []
  const patches: LedgerPatch[] = []

  for (const e of entries) {
    if (e.status !== 'success' || e.confirmed === true) continue
    const bucket: Bucket | null = snapshot[bucketKeyForReason(e.reason)]
    const afterMs = bucket?.resetsAt?.getTime() ?? null
    if (resetMoved(e.resetsAtBeforeMs, afterMs)) {
      patches.push({ ts: e.ts, patch: { confirmed: true, resetsAtAfterMs: afterMs } })
    } else if (e.confirmed === null && nowMs - e.ts > giveUpAfterMs) {
      patches.push({ ts: e.ts, patch: { confirmed: false, resetsAtAfterMs: afterMs } })
    }
  }
  return patches
}

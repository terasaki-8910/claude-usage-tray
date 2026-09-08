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

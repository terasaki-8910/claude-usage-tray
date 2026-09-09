import type { BucketDto, LedgerEntry } from './types'
import { bucketKeyForReason } from './ping-confirm'

/**
 * The session window is consistently labeled "セッション(5時間)" across
 * every real sample seen — unlike the weekly window (whose reset times
 * look calendar-aligned, not simply "7 days after last use"), this one is
 * well-confirmed as a fixed rolling duration. Scoped to session only for
 * that reason: estimating weekly's reset the same way could easily be
 * wrong.
 */
export const SESSION_WINDOW_MS = 5 * 60 * 60_000

export interface ResetEstimate {
  resetsAtMs: number
  /** When the ping that this estimate is based on was sent. */
  sourceTs: number
}

/**
 * Estimates when the session window will reset, based on the most recent
 * successful ping — for use ONLY when the real data has nothing (null or
 * already-passed resetsAt). This exists because `cachedUsageUtilization`
 * has no known reliable refresh trigger (confirmed: 6.75+ hours with zero
 * update under continuous heavy use), so waiting for confirmed data to
 * show a session reset can leave the UI stuck on "不明" indefinitely even
 * though the ping most likely worked. An estimate from a known constant
 * (5 hours) is honest in a way that guessing an unknown percentage would
 * not be — the caller must label this as an estimate, never present it as
 * confirmed.
 *
 * Returns null once the estimated window would itself have already
 * expired — an estimate has no value past its own claimed reset time.
 */
export function estimateSessionReset(entries: readonly LedgerEntry[], nowMs: number): ResetEstimate | null {
  let best: LedgerEntry | null = null
  for (const e of entries) {
    if (e.status !== 'success' || bucketKeyForReason(e.reason) !== 'session') continue
    if (e.ts + SESSION_WINDOW_MS <= nowMs) continue // this estimate would already have expired
    if (!best || e.ts > best.ts) best = e
  }
  return best ? { resetsAtMs: best.ts + SESSION_WINDOW_MS, sourceTs: best.ts } : null
}

/**
 * Fills in the session bucket's reset time with an estimate when the real
 * data has none — leaves confirmed data (a real, still-future resetsAt)
 * untouched. `real` may be null (bucket never seen at all yet, the
 * bootstrap case); the estimate can still apply then.
 */
export function applySessionEstimate(
  real: BucketDto | null,
  entries: readonly LedgerEntry[],
  nowMs: number
): BucketDto | null {
  if (real?.resetsAtIso) {
    const realMs = Date.parse(real.resetsAtIso)
    if (!Number.isNaN(realMs) && realMs > nowMs) return real
  }
  const estimate = estimateSessionReset(entries, nowMs)
  if (!estimate) return real
  return {
    percent: real?.percent ?? 0,
    severity: real?.severity ?? 'unknown',
    label: real?.label ?? 'セッション(5時間)',
    resetsAtIso: new Date(estimate.resetsAtMs).toISOString(),
    resetsAtEstimated: true
  }
}

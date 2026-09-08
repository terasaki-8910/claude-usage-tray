import { describe, expect, it } from 'vitest'
import { bucketKeyForReason, reconcilePendingPings, resetMoved, MIN_RESET_MOVE_MS } from './ping-confirm'
import { makeBucket, makeLedgerEntry, makeSnapshot } from './test-helpers'

describe('bucketKeyForReason', () => {
  it('judges a weekly-triggered ping on the weekly window', () => {
    expect(bucketKeyForReason('weekly_all')).toBe('weeklyAll')
  })

  it('judges session and manual pings on the session window', () => {
    // Regression: a `reason === 'session' ? … : weeklyAll` ternary sent
    // every manual ping to the weekly bucket, so a manual send was
    // measured against a window it had nothing to do with.
    expect(bucketKeyForReason('session')).toBe('session')
    expect(bucketKeyForReason('manual')).toBe('session')
    expect(bucketKeyForReason('anything-else')).toBe('session')
  })
})

describe('resetMoved', () => {
  const base = Date.parse('2026-09-14T21:59:59.762Z')

  it('ignores sub-second jitter from the server', () => {
    // Exactly the real case that produced a false "確認済": the same
    // reset instant reported 26 ms apart on consecutive fetches.
    const after = Date.parse('2026-09-14T21:59:59.788Z')
    expect(resetMoved(base, after)).toBe(false)
  })

  it('ignores any drift below the threshold', () => {
    expect(resetMoved(base, base)).toBe(false)
    expect(resetMoved(base, base + MIN_RESET_MOVE_MS - 1)).toBe(false)
    expect(resetMoved(base, base - (MIN_RESET_MOVE_MS - 1))).toBe(false)
  })

  it('reports a real window restart', () => {
    expect(resetMoved(base, base + 5 * 60 * 60_000)).toBe(true)
    expect(resetMoved(base, base + MIN_RESET_MOVE_MS)).toBe(true)
  })

  it('treats "no window before, one now" as a restart', () => {
    expect(resetMoved(null, base)).toBe(true)
  })

  it('is not a restart when there is still no window', () => {
    expect(resetMoved(base, null)).toBe(false)
    expect(resetMoved(null, null)).toBe(false)
  })
})

describe('reconcilePendingPings', () => {
  const NOW = Date.parse('2026-09-09T00:00:00Z')
  const BEFORE_MS = Date.parse('2026-09-08T12:00:00Z')
  const MOVED_MS = Date.parse('2026-09-08T17:00:00Z') // +5h, a real restart

  it('confirms a pending ping whose bucket reset actually moved', () => {
    const entries = [
      makeLedgerEntry({ ts: NOW - 60_000, status: 'success', reason: 'session', resetsAtBeforeMs: BEFORE_MS, confirmed: null })
    ]
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: new Date(MOVED_MS) }) })
    const patches = reconcilePendingPings(entries, snap, NOW)
    expect(patches).toEqual([{ ts: NOW - 60_000, patch: { confirmed: true, resetsAtAfterMs: MOVED_MS } }])
  })

  it('does NOT give up early just because the cache has not refreshed yet', () => {
    // This is the exact real-world case: 20+ minutes with no movement.
    // Before the fix, a fixed 15s-120s window would have already reported
    // false here. It must keep waiting until giveUpAfterMs.
    const entries = [
      makeLedgerEntry({ ts: NOW - 20 * 60_000, status: 'success', reason: 'session', resetsAtBeforeMs: BEFORE_MS, confirmed: null })
    ]
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: new Date(BEFORE_MS) }) }) // unchanged
    expect(reconcilePendingPings(entries, snap, NOW)).toEqual([])
  })

  it('gives up (confirmed:false) only after giveUpAfterMs with no movement', () => {
    const entries = [
      makeLedgerEntry({ ts: NOW - 31 * 60_000, status: 'success', reason: 'session', resetsAtBeforeMs: BEFORE_MS, confirmed: null })
    ]
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: new Date(BEFORE_MS) }) })
    const patches = reconcilePendingPings(entries, snap, NOW, 30 * 60_000)
    expect(patches).toEqual([{ ts: NOW - 31 * 60_000, patch: { confirmed: false, resetsAtAfterMs: BEFORE_MS } }])
  })

  it('can upgrade an earlier false to true if the cache catches up late', () => {
    const entries = [
      makeLedgerEntry({ ts: NOW - 60_000, status: 'success', reason: 'session', resetsAtBeforeMs: BEFORE_MS, confirmed: false })
    ]
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: new Date(MOVED_MS) }) })
    const patches = reconcilePendingPings(entries, snap, NOW)
    expect(patches).toEqual([{ ts: NOW - 60_000, patch: { confirmed: true, resetsAtAfterMs: MOVED_MS } }])
  })

  it('never touches an already-confirmed entry', () => {
    const entries = [
      makeLedgerEntry({ ts: NOW - 60_000, status: 'success', reason: 'session', resetsAtBeforeMs: BEFORE_MS, confirmed: true, resetsAtAfterMs: MOVED_MS })
    ]
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: new Date(MOVED_MS + 999_999) }) })
    expect(reconcilePendingPings(entries, snap, NOW)).toEqual([])
  })

  it('ignores in-flight and error entries', () => {
    const entries = [
      makeLedgerEntry({ ts: NOW - 60_000, status: 'in-flight', confirmed: null }),
      makeLedgerEntry({ ts: NOW - 60_000, status: 'error', confirmed: null })
    ]
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: new Date(MOVED_MS) }) })
    expect(reconcilePendingPings(entries, snap, NOW)).toEqual([])
  })

  it('produces nothing from a stale snapshot', () => {
    const entries = [
      makeLedgerEntry({ ts: NOW - 60_000, status: 'success', reason: 'session', resetsAtBeforeMs: BEFORE_MS, confirmed: null })
    ]
    const snap = makeSnapshot({ stale: true, session: makeBucket({ resetsAt: new Date(MOVED_MS) }) })
    expect(reconcilePendingPings(entries, snap, NOW)).toEqual([])
  })
})

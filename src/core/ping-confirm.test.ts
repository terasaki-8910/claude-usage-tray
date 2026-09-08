import { describe, expect, it } from 'vitest'
import { bucketKeyForReason, resetMoved, MIN_RESET_MOVE_MS } from './ping-confirm'

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

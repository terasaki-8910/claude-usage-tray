import { describe, expect, it } from 'vitest'
import { applySessionEstimate, estimateSessionReset, SESSION_WINDOW_MS } from './reset-estimate'
import { makeLedgerEntry } from './test-helpers'
import type { BucketDto } from './types'

const NOW = Date.parse('2026-09-09T12:00:00Z')

describe('estimateSessionReset', () => {
  it('returns null with no ledger history', () => {
    expect(estimateSessionReset([], NOW)).toBeNull()
  })

  it('estimates 5 hours after the most recent successful session/manual ping', () => {
    const ts = NOW - 60 * 60_000 // 1h ago
    const entries = [makeLedgerEntry({ ts, status: 'success', reason: 'manual' })]
    expect(estimateSessionReset(entries, NOW)).toEqual({ resetsAtMs: ts + SESSION_WINDOW_MS, sourceTs: ts })
  })

  it('treats reason "session" the same as "manual" — both judge the session bucket', () => {
    const ts = NOW - 60 * 60_000
    const entries = [makeLedgerEntry({ ts, status: 'success', reason: 'session' })]
    expect(estimateSessionReset(entries, NOW)?.sourceTs).toBe(ts)
  })

  it('ignores a weekly_all ping — scoped to session only, deliberately', () => {
    const entries = [makeLedgerEntry({ ts: NOW - 60_000, status: 'success', reason: 'weekly_all' })]
    expect(estimateSessionReset(entries, NOW)).toBeNull()
  })

  it('ignores in-flight and error entries', () => {
    const entries = [
      makeLedgerEntry({ ts: NOW - 60_000, status: 'in-flight', reason: 'session' }),
      makeLedgerEntry({ ts: NOW - 30_000, status: 'error', reason: 'session' })
    ]
    expect(estimateSessionReset(entries, NOW)).toBeNull()
  })

  it('returns null once the estimated window would already have expired', () => {
    const ts = NOW - (SESSION_WINDOW_MS + 60_000) // 5h1m ago — its own estimate already passed
    const entries = [makeLedgerEntry({ ts, status: 'success', reason: 'session' })]
    expect(estimateSessionReset(entries, NOW)).toBeNull()
  })

  it('picks the most recent of several eligible pings', () => {
    const older = NOW - 4 * 60 * 60_000
    const newer = NOW - 30 * 60_000
    const entries = [
      makeLedgerEntry({ ts: older, status: 'success', reason: 'session' }),
      makeLedgerEntry({ ts: newer, status: 'success', reason: 'manual' })
    ]
    expect(estimateSessionReset(entries, NOW)?.sourceTs).toBe(newer)
  })
})

function dto(overrides: Partial<BucketDto> = {}): BucketDto {
  return { percent: 0, severity: 'normal', resetsAtIso: null, label: 'セッション(5時間)', ...overrides }
}

describe('applySessionEstimate', () => {
  it('leaves confirmed, still-future data untouched', () => {
    const real = dto({ percent: 12, resetsAtIso: new Date(NOW + 60_000).toISOString() })
    expect(applySessionEstimate(real, [], NOW)).toBe(real)
  })

  it('overrides a null resetsAt with an estimate, marking it as such', () => {
    const ts = NOW - 60 * 60_000
    const real = dto({ percent: 0, resetsAtIso: null })
    const entries = [makeLedgerEntry({ ts, status: 'success', reason: 'session' })]
    const result = applySessionEstimate(real, entries, NOW)
    expect(result?.resetsAtEstimated).toBe(true)
    expect(result?.resetsAtIso).toBe(new Date(ts + SESSION_WINDOW_MS).toISOString())
  })

  it('overrides an already-passed real resetsAt with an estimate', () => {
    const ts = NOW - 60 * 60_000
    const real = dto({ resetsAtIso: new Date(NOW - 1_000).toISOString() }) // just passed
    const entries = [makeLedgerEntry({ ts, status: 'success', reason: 'session' })]
    expect(applySessionEstimate(real, entries, NOW)?.resetsAtEstimated).toBe(true)
  })

  it('applies even when the real bucket is null (bootstrap case)', () => {
    const ts = NOW - 60 * 60_000
    const entries = [makeLedgerEntry({ ts, status: 'success', reason: 'manual' })]
    const result = applySessionEstimate(null, entries, NOW)
    expect(result?.resetsAtEstimated).toBe(true)
    expect(result?.label).toBe('セッション(5時間)')
  })

  it('returns the real value unchanged when there is nothing to estimate from', () => {
    const real = dto({ resetsAtIso: null })
    expect(applySessionEstimate(real, [], NOW)).toBe(real)
    expect(applySessionEstimate(null, [], NOW)).toBeNull()
  })

  it('never marks a result as estimated when returning real data', () => {
    const real = dto({ resetsAtIso: new Date(NOW + 60_000).toISOString() })
    expect(applySessionEstimate(real, [], NOW)?.resetsAtEstimated).toBeUndefined()
  })
})

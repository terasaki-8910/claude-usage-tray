import { describe, expect, it } from 'vitest'
import { decide } from './scheduler-logic'
import { makeBucket, makeConfig, makeLedgerEntry, makeSnapshot } from './test-helpers'

const NOW = new Date('2026-09-08T00:00:00Z')
const PAST = new Date('2026-09-07T00:00:00Z')
const FUTURE = new Date('2026-09-09T00:00:00Z')

describe('decide — gating', () => {
  it('never pings when disabled in config, even if everything has lapsed', () => {
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: PAST }) })
    const result = decide(snap, [], makeConfig({ pingEnabled: false }), NOW)
    expect(result).toEqual({ ping: false, reason: 'ping-disabled' })
  })

  it('never pings on a stale snapshot', () => {
    const snap = makeSnapshot({ stale: true })
    const result = decide(snap, [], makeConfig(), NOW)
    expect(result).toEqual({ ping: false, reason: 'snapshot-stale' })
  })
})

describe('decide — lapsed detection', () => {
  it('does not ping when both buckets have a future resetsAt', () => {
    const snap = makeSnapshot({
      session: makeBucket({ resetsAt: FUTURE }),
      weeklyAll: makeBucket({ resetsAt: FUTURE })
    })
    expect(decide(snap, [], makeConfig(), NOW)).toEqual({ ping: false, reason: 'nothing-lapsed' })
  })

  it('pings for reason "session" when only the session bucket has lapsed', () => {
    const snap = makeSnapshot({
      session: makeBucket({ resetsAt: PAST }),
      weeklyAll: makeBucket({ resetsAt: FUTURE })
    })
    expect(decide(snap, [], makeConfig(), NOW)).toEqual({ ping: true, reason: 'session' })
  })

  it('pings for reason "weekly_all" when only the weekly bucket has lapsed', () => {
    const snap = makeSnapshot({
      session: makeBucket({ resetsAt: FUTURE }),
      weeklyAll: makeBucket({ resetsAt: PAST })
    })
    expect(decide(snap, [], makeConfig(), NOW)).toEqual({ ping: true, reason: 'weekly_all' })
  })

  it('prioritizes session when both have lapsed', () => {
    const snap = makeSnapshot({
      session: makeBucket({ resetsAt: PAST }),
      weeklyAll: makeBucket({ resetsAt: PAST })
    })
    expect(decide(snap, [], makeConfig(), NOW)).toEqual({ ping: true, reason: 'session' })
  })

  it('treats a never-seen bucket (null) as lapsed — bootstrap case', () => {
    const snap = makeSnapshot({ session: null, weeklyAll: makeBucket({ resetsAt: FUTURE }) })
    expect(decide(snap, [], makeConfig(), NOW)).toEqual({ ping: true, reason: 'session' })
  })

  it('treats a bucket with resetsAt:null as lapsed (window never started)', () => {
    const snap = makeSnapshot({
      session: makeBucket({ resetsAt: null }),
      weeklyAll: makeBucket({ resetsAt: FUTURE })
    })
    expect(decide(snap, [], makeConfig(), NOW)).toEqual({ ping: true, reason: 'session' })
  })

  it('does NOT treat isActive:false as lapsed when resetsAt is in the future (real observed shape)', () => {
    // Reproduces actual captured data: session had a valid future resetsAt
    // and isActive:false; weekly_all had isActive:true. Neither should
    // cause a ping — only wall-clock time against resetsAt matters.
    const snap = makeSnapshot({
      session: makeBucket({ resetsAt: FUTURE, isActive: false, percent: 15 }),
      weeklyAll: makeBucket({ resetsAt: FUTURE, isActive: true, percent: 63 })
    })
    expect(decide(snap, [], makeConfig(), NOW)).toEqual({ ping: false, reason: 'nothing-lapsed' })
  })
})

describe('decide — guards still apply when something has lapsed', () => {
  it('withholds the ping when a guard blocks, surfacing the guard reason', () => {
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: PAST }) })
    const cfg = makeConfig({ maxPingsPerHour: 0 })
    expect(decide(snap, [], cfg, NOW)).toEqual({ ping: false, reason: 'rate-limited' })
  })

  it('respects the debounce guard against a very recent ping', () => {
    const snap = makeSnapshot({ session: makeBucket({ resetsAt: PAST }) })
    const cfg = makeConfig({ minPingSpacingMs: 60 * 60_000 })
    const ledger = [makeLedgerEntry({ ts: NOW.getTime() - 1_000 })]
    expect(decide(snap, ledger, cfg, NOW)).toEqual({ ping: false, reason: 'debounced' })
  })
})

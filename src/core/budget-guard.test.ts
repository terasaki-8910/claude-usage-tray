import { describe, expect, it } from 'vitest'
import { checkGuards, consecutiveErrors, msSinceLastPing, pingsInLastHour, spendInLastDay } from './budget-guard'
import { makeConfig, makeLedgerEntry } from './test-helpers'

const NOW = Date.parse('2026-09-08T00:00:00Z')

describe('pingsInLastHour', () => {
  it('counts only entries within the trailing hour', () => {
    const ledger = [
      makeLedgerEntry({ ts: NOW - 30 * 60_000 }), // 30 min ago -> counts
      makeLedgerEntry({ ts: NOW - 90 * 60_000 }) // 90 min ago -> does not
    ]
    expect(pingsInLastHour(ledger, NOW)).toBe(1)
  })
})

describe('spendInLastDay', () => {
  it('sums costUsd within the trailing 24h, ignoring older entries and nulls', () => {
    const ledger = [
      makeLedgerEntry({ ts: NOW - 1 * 60_000, costUsd: 0.001 }),
      makeLedgerEntry({ ts: NOW - 23 * 60 * 60_000, costUsd: 0.002 }),
      makeLedgerEntry({ ts: NOW - 25 * 60 * 60_000, costUsd: 100 }), // outside window
      makeLedgerEntry({ ts: NOW - 2 * 60_000, costUsd: null, status: 'in-flight' })
    ]
    expect(spendInLastDay(ledger, NOW)).toBeCloseTo(0.003, 6)
  })
})

describe('consecutiveErrors', () => {
  it('counts trailing errors from most recent, stopping at a success', () => {
    const ledger = [
      makeLedgerEntry({ ts: NOW - 30_000, status: 'error' }),
      makeLedgerEntry({ ts: NOW - 20_000, status: 'error' }),
      makeLedgerEntry({ ts: NOW - 10_000, status: 'error' }),
      makeLedgerEntry({ ts: NOW - 5_000, status: 'success' }) // most recent -> resets the streak to 0
    ]
    expect(consecutiveErrors(ledger)).toBe(0)
  })

  it('ignores in-flight entries when counting', () => {
    const ledger = [
      makeLedgerEntry({ ts: NOW - 30_000, status: 'error' }),
      makeLedgerEntry({ ts: NOW - 20_000, status: 'error' }),
      makeLedgerEntry({ ts: NOW - 1_000, status: 'in-flight' })
    ]
    expect(consecutiveErrors(ledger)).toBe(2)
  })

  it('is 0 for an empty ledger', () => {
    expect(consecutiveErrors([])).toBe(0)
  })
})

describe('msSinceLastPing', () => {
  it('returns null for an empty ledger', () => {
    expect(msSinceLastPing([], NOW)).toBeNull()
  })

  it('returns the gap to the most recent entry regardless of array order', () => {
    const ledger = [makeLedgerEntry({ ts: NOW - 5_000 }), makeLedgerEntry({ ts: NOW - 50_000 })]
    expect(msSinceLastPing(ledger, NOW)).toBe(5_000)
  })
})

describe('checkGuards', () => {
  it('allows when the ledger is empty', () => {
    expect(checkGuards([], makeConfig(), NOW)).toEqual({ allowed: true })
  })

  it('blocks on debounce first, before any other guard', () => {
    const cfg = makeConfig({ minPingSpacingMs: 10 * 60_000, maxPingsPerHour: 0 })
    const ledger = [makeLedgerEntry({ ts: NOW - 1_000 })]
    expect(checkGuards(ledger, cfg, NOW)).toEqual({ allowed: false, reason: 'debounced' })
  })

  it('blocks on rate limit once spacing has passed', () => {
    const cfg = makeConfig({ minPingSpacingMs: 0, maxPingsPerHour: 1 })
    const ledger = [makeLedgerEntry({ ts: NOW - 1_000 })]
    expect(checkGuards(ledger, cfg, NOW)).toEqual({ allowed: false, reason: 'rate-limited' })
  })

  it('blocks on spend ceiling', () => {
    const cfg = makeConfig({ minPingSpacingMs: 0, maxPingsPerHour: 100, dailySpendCeilingUsd: 0.001 })
    const ledger = [makeLedgerEntry({ ts: NOW - 2 * 60 * 60_000, costUsd: 0.002 })]
    expect(checkGuards(ledger, cfg, NOW)).toEqual({ allowed: false, reason: 'spend-ceiling' })
  })

  it('blocks on circuit breaker after N consecutive errors', () => {
    const cfg = makeConfig({ minPingSpacingMs: 0, maxPingsPerHour: 100, dailySpendCeilingUsd: 100, circuitBreakerN: 2 })
    const ledger = [
      makeLedgerEntry({ ts: NOW - 3 * 60 * 60_000, status: 'error' }),
      makeLedgerEntry({ ts: NOW - 2 * 60 * 60_000, status: 'error' })
    ]
    expect(checkGuards(ledger, cfg, NOW)).toEqual({ allowed: false, reason: 'circuit-open' })
  })
})

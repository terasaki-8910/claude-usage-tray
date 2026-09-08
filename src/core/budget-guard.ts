import type { Config, LedgerEntry } from './types'

const ONE_HOUR_MS = 60 * 60_000
const ONE_DAY_MS = 24 * ONE_HOUR_MS

export function pingsInLastHour(ledger: readonly LedgerEntry[], nowMs: number): number {
  return ledger.filter((e) => nowMs - e.ts < ONE_HOUR_MS).length
}

export function spendInLastDay(ledger: readonly LedgerEntry[], nowMs: number): number {
  return ledger
    .filter((e) => nowMs - e.ts < ONE_DAY_MS && typeof e.costUsd === 'number')
    .reduce((sum, e) => sum + (e.costUsd ?? 0), 0)
}

/** Counts trailing consecutive errors among *settled* entries (in-flight
 * ones are skipped), most recent first, stopping at the first success. */
export function consecutiveErrors(ledger: readonly LedgerEntry[]): number {
  const settled = ledger
    .filter((e) => e.status !== 'in-flight')
    .slice()
    .sort((a, b) => b.ts - a.ts)
  let count = 0
  for (const e of settled) {
    if (e.status === 'error') count++
    else break
  }
  return count
}

export function msSinceLastPing(ledger: readonly LedgerEntry[], nowMs: number): number | null {
  if (ledger.length === 0) return null
  const lastTs = Math.max(...ledger.map((e) => e.ts))
  return nowMs - lastTs
}

export type GuardReason = 'rate-limited' | 'spend-ceiling' | 'circuit-open' | 'debounced'
export interface GuardResult {
  allowed: boolean
  reason?: GuardReason
}

/** Runs every spend/rate safety check and returns the first that blocks.
 * Pure: takes the ledger + config + now, returns a verdict, no side
 * effects. This is the last line of defense against a misconfigured or
 * repeatedly-firing ping burning real money. */
export function checkGuards(ledger: readonly LedgerEntry[], cfg: Config, nowMs: number): GuardResult {
  const sinceLast = msSinceLastPing(ledger, nowMs)
  if (sinceLast !== null && sinceLast < cfg.minPingSpacingMs) {
    return { allowed: false, reason: 'debounced' }
  }
  if (pingsInLastHour(ledger, nowMs) >= cfg.maxPingsPerHour) {
    return { allowed: false, reason: 'rate-limited' }
  }
  if (spendInLastDay(ledger, nowMs) >= cfg.dailySpendCeilingUsd) {
    return { allowed: false, reason: 'spend-ceiling' }
  }
  if (consecutiveErrors(ledger) >= cfg.circuitBreakerN) {
    return { allowed: false, reason: 'circuit-open' }
  }
  return { allowed: true }
}

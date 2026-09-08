import type { Bucket, Config, LedgerEntry, Snapshot } from './types'
import { DEFAULT_CONFIG } from './types'

export function makeBucket(overrides: Partial<Bucket> = {}): Bucket {
  return {
    kind: 'session',
    percent: 10,
    severity: 'normal',
    resetsAt: null,
    isActive: false,
    label: 'test-bucket',
    ...overrides
  }
}

export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    fetchedAtMs: Date.now(),
    session: null,
    weeklyAll: null,
    weeklyFable: null,
    stale: false,
    raw: null,
    ...overrides
  }
}

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, pingEnabled: true, ...overrides }
}

export function makeLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    ts: Date.now(),
    status: 'success',
    reason: 'session',
    costUsd: 0.0008,
    isError: false,
    subtype: 'success',
    resetsAtBeforeMs: null,
    resetsAtAfterMs: null,
    confirmed: true,
    ...overrides
  }
}

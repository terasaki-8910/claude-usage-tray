/** A single usage-limit bucket, normalized from whatever raw shape the
 * source file happened to use (current `limits[]` entries, or the legacy
 * `five_hour`/`seven_day` fields used as a fallback). */
export interface Bucket {
  kind: string
  percent: number
  severity: string
  resetsAt: Date | null
  /**
   * NOTE: despite the name, this does NOT mean "this window is currently
   * open/counting". Observed data shows a session bucket with a valid
   * future `resetsAt` and non-zero percent reported as `is_active: false`
   * while `weekly_all` was `is_active: true` at the same instant. It
   * appears to mean "this is currently the binding/primary constraint",
   * not "has not lapsed". Do NOT use this field to decide whether a ping
   * is needed — use `resetsAt` vs. now instead. Kept for possible future
   * UI use (e.g. highlighting the current binding limit).
   */
  isActive: boolean
  /** Human-readable label for display, e.g. "セッション(5時間)". */
  label: string
}

export interface Snapshot {
  /** When the source data was fetched by the Claude Code CLI, epoch ms. Null if unknown. */
  fetchedAtMs: number | null
  session: Bucket | null
  weeklyAll: Bucket | null
  weeklyFable: Bucket | null
  /** True if parsing failed or the source was structurally unrecognized —
   * callers should keep showing the last-known-good snapshot instead. */
  stale: boolean
  /** The parsed-but-untyped source object, kept for a possible "advanced" debug view. */
  raw: unknown
}

export type LedgerStatus = 'in-flight' | 'success' | 'error'

export interface LedgerEntry {
  /** Epoch ms when the ping was initiated. */
  ts: number
  status: LedgerStatus
  /** Which bucket triggered this ping: 'session' | 'weekly_all'. */
  reason: string
  costUsd: number | null
  isError: boolean | null
  subtype: string | null
  resetsAtBeforeMs: number | null
  resetsAtAfterMs: number | null
  /** Whether a follow-up poll actually observed resetsAt move. Null while still checking. */
  confirmed: boolean | null
}

export interface Config {
  pingEnabled: boolean
  maxPingsPerHour: number
  dailySpendCeilingUsd: number
  /** Consecutive ping errors before the scheduler refuses to fire and requires manual re-arm. */
  circuitBreakerN: number
  minPingSpacingMs: number
  perPingCapUsd: number
}

export const DEFAULT_CONFIG: Config = {
  pingEnabled: false,
  maxPingsPerHour: 2,
  dailySpendCeilingUsd: 1.0,
  circuitBreakerN: 3,
  minPingSpacingMs: 10 * 60_000,
  perPingCapUsd: 0.02
}

export type PingDecision = { ping: true; reason: string } | { ping: false; reason: string }

/** Serializable DTO sent to the popup renderer over IPC (Dates -> ISO strings). */
export interface BucketDto {
  percent: number
  severity: string
  resetsAtIso: string | null
  label: string
}

export interface PopupState {
  fetchedAtMs: number | null
  stale: boolean
  session: BucketDto | null
  weeklyAll: BucketDto | null
  weeklyFable: BucketDto | null
  pingEnabled: boolean
  lastPingSummary: string | null
}

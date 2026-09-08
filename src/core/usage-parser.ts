import type { Bucket, BucketDto, Snapshot } from './types'

/**
 * Parses `.claude.json`'s `cachedUsageUtilization` blob into a normalized
 * Snapshot. Never throws: any structural surprise yields `stale: true`
 * with null buckets so a 5-minute poll loop can fall back to the last
 * known-good snapshot instead of crashing.
 *
 * The source schema churns (several null "codenamed" buckets alongside the
 * real ones have been observed, e.g. `tangelo`, `nimbus_quill`). Unknown
 * keys are ignored on purpose — that is the expected steady state, not an
 * error condition.
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function parseResetsAt(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Maps a `limits[]` entry (current schema) to a Bucket. */
function bucketFromLimit(raw: unknown, label: string): Bucket | null {
  const r = asRecord(raw)
  if (!r) return null
  const percent = typeof r.percent === 'number' ? r.percent : null
  if (percent === null) return null
  return {
    kind: typeof r.kind === 'string' ? r.kind : 'unknown',
    percent,
    severity: typeof r.severity === 'string' ? r.severity : 'unknown',
    resetsAt: parseResetsAt(r.resets_at),
    isActive: r.is_active === true,
    label
  }
}

/** Maps a legacy `five_hour` / `seven_day` field to a Bucket, used only
 * when `limits[]` didn't yield the corresponding bucket. This shape has no
 * `is_active`/`severity`, so those are best-effort defaults. */
function bucketFromLegacy(raw: unknown, kind: string, label: string): Bucket | null {
  const r = asRecord(raw)
  if (!r) return null
  const percent = typeof r.utilization === 'number' ? r.utilization : null
  if (percent === null) return null
  const resetsAt = parseResetsAt(r.resets_at)
  return {
    kind,
    percent,
    severity: 'unknown',
    resetsAt,
    isActive: resetsAt !== null,
    label
  }
}

function displayNameOf(limit: Record<string, unknown>): unknown {
  const scope = asRecord(limit.scope)
  const model = scope ? asRecord(scope.model) : null
  return model ? model.display_name : undefined
}

export function parseUsageBlob(raw: unknown): Snapshot {
  const empty: Snapshot = {
    fetchedAtMs: null,
    session: null,
    weeklyAll: null,
    weeklyFable: null,
    stale: true,
    raw
  }

  const root = asRecord(raw)
  if (!root) return empty

  const cached = asRecord(root.cachedUsageUtilization)
  if (!cached) return empty

  const fetchedAtMs = typeof cached.fetchedAtMs === 'number' ? cached.fetchedAtMs : null
  const utilization = asRecord(cached.utilization)
  if (!utilization) return { ...empty, fetchedAtMs }

  const limits = Array.isArray(utilization.limits) ? utilization.limits : []

  let session: Bucket | null = null
  let weeklyAll: Bucket | null = null
  let weeklyFable: Bucket | null = null

  for (const entry of limits) {
    const r = asRecord(entry)
    if (!r) continue
    switch (r.kind) {
      case 'session':
        session = bucketFromLimit(r, 'セッション(5時間)')
        break
      case 'weekly_all':
        weeklyAll = bucketFromLimit(r, '週間(all models)')
        break
      case 'weekly_scoped':
        if (displayNameOf(r) === 'Fable') {
          weeklyFable = bucketFromLimit(r, '週間(Fable)')
        }
        break
      default:
        // Unrecognized kind (schema churn) — ignored on purpose.
        break
    }
  }

  // Defensive fallback: if the current-schema limits[] didn't yield a
  // bucket, try the legacy five_hour/seven_day fields before giving up.
  if (!session) session = bucketFromLegacy(utilization.five_hour, 'session', 'セッション(5時間)')
  if (!weeklyAll) weeklyAll = bucketFromLegacy(utilization.seven_day, 'weekly_all', '週間(all models)')

  return {
    fetchedAtMs,
    session,
    weeklyAll,
    weeklyFable,
    stale: false,
    raw
  }
}

/** Maps a Bucket to its IPC-serializable DTO (Date -> ISO string). */
export function bucketToDto(b: Bucket | null): BucketDto | null {
  if (!b) return null
  return {
    percent: b.percent,
    severity: b.severity,
    resetsAtIso: b.resetsAt ? b.resetsAt.toISOString() : null,
    label: b.label
  }
}

/** Parses the raw JSON text of `.claude.json`. Never throws — a torn read
 * (the CLI rewrites this file wholesale, so a poll can catch it mid-write)
 * yields a stale empty Snapshot instead of propagating an exception into a
 * loop that runs every 5 minutes. */
export function parseUsageFile(jsonText: string): Snapshot {
  try {
    return parseUsageBlob(JSON.parse(jsonText))
  } catch {
    return {
      fetchedAtMs: null,
      session: null,
      weeklyAll: null,
      weeklyFable: null,
      stale: true,
      raw: null
    }
  }
}

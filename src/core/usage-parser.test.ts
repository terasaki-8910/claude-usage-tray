import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseUsageBlob, parseUsageFile } from './usage-parser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sampleText = readFileSync(join(__dirname, '__fixtures__', 'usage-blob.sample.json'), 'utf8')

describe('parseUsageFile — real captured shape', () => {
  it('extracts session, weekly-all, and weekly-Fable correctly', () => {
    const snap = parseUsageFile(sampleText)
    expect(snap.stale).toBe(false)
    expect(snap.fetchedAtMs).toBe(1788810361674)

    expect(snap.session).not.toBeNull()
    expect(snap.session?.percent).toBe(15)
    expect(snap.session?.kind).toBe('session')
    expect(snap.session?.resetsAt?.toISOString()).toBe('2026-09-08T00:40:00.436Z')

    expect(snap.weeklyAll).not.toBeNull()
    expect(snap.weeklyAll?.percent).toBe(63)
    expect(snap.weeklyAll?.kind).toBe('weekly_all')

    expect(snap.weeklyFable).not.toBeNull()
    expect(snap.weeklyFable?.percent).toBe(12)
    expect(snap.weeklyFable?.label).toBe('週間(Fable)')
  })

  it('ignores unknown/null codenamed buckets without failing', () => {
    // The fixture already contains six null "codenamed" buckets
    // (tangelo, iguana_necktie, ...). A passing run above proves they were
    // tolerated; this test just makes the intent explicit and future-proofs
    // against a change that stops ignoring unknown keys.
    const snap = parseUsageFile(sampleText)
    expect(snap.stale).toBe(false)
  })
})

describe('parseUsageFile — malformed input never throws', () => {
  it('returns a stale empty snapshot for truncated JSON', () => {
    const snap = parseUsageFile(sampleText.slice(0, 50))
    expect(snap.stale).toBe(true)
    expect(snap.session).toBeNull()
    expect(snap.weeklyAll).toBeNull()
    expect(snap.weeklyFable).toBeNull()
  })

  it('returns a stale empty snapshot for valid JSON with no usage key', () => {
    const snap = parseUsageBlob({ somethingElse: true })
    expect(snap.stale).toBe(true)
  })

  it('returns a stale empty snapshot for non-object input', () => {
    expect(parseUsageBlob(null).stale).toBe(true)
    expect(parseUsageBlob('a string').stale).toBe(true)
    expect(parseUsageBlob(42).stale).toBe(true)
  })
})

describe('parseUsageBlob — legacy five_hour/seven_day fallback', () => {
  it('falls back when limits[] is missing entirely', () => {
    const blob = {
      cachedUsageUtilization: {
        fetchedAtMs: 1000,
        utilization: {
          five_hour: { utilization: 42, resets_at: '2026-09-08T00:00:00Z' },
          seven_day: { utilization: 77, resets_at: '2026-09-10T00:00:00Z' }
          // no `limits` key at all
        }
      }
    }
    const snap = parseUsageBlob(blob)
    expect(snap.stale).toBe(false)
    expect(snap.session?.percent).toBe(42)
    expect(snap.session?.kind).toBe('session')
    expect(snap.weeklyAll?.percent).toBe(77)
    expect(snap.weeklyFable).toBeNull() // no legacy equivalent exists
  })

  it('prefers limits[] over legacy fields when both are present', () => {
    const blob = {
      cachedUsageUtilization: {
        fetchedAtMs: 1000,
        utilization: {
          five_hour: { utilization: 999, resets_at: null }, // should be ignored
          limits: [
            {
              kind: 'session',
              percent: 15,
              severity: 'normal',
              resets_at: '2026-09-08T00:40:00Z',
              is_active: false
            }
          ]
        }
      }
    }
    const snap = parseUsageBlob(blob)
    expect(snap.session?.percent).toBe(15)
  })
})

describe('Bucket.isActive is parsed but must not be conflated with "lapsed"', () => {
  it('reproduces the observed real-world case: session inactive-but-fresh, weekly active', () => {
    const snap = parseUsageFile(sampleText)
    // Real captured data: session had a valid future resetsAt and 15%
    // usage yet is_active:false, while weekly_all was is_active:true.
    // This proves is_active means "current binding constraint", not
    // "window is open" — scheduler-logic must key off resetsAt, not this.
    expect(snap.session?.isActive).toBe(false)
    expect(snap.session?.resetsAt).not.toBeNull()
    expect(snap.weeklyAll?.isActive).toBe(true)
  })
})

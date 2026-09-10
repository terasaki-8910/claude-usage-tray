import { describe, expect, it, vi } from 'vitest'
import { dedupeInFlight } from './dedupe-in-flight'

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('dedupeInFlight', () => {
  it('runs once for a single call and returns its result', async () => {
    const run = vi.fn(async () => 'result')
    const deduped = dedupeInFlight(run)
    await expect(deduped()).resolves.toBe('result')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('THE BUG: a caller arriving while a run is in-flight gets that same run — not an instant no-op', async () => {
    const d = deferred<string>()
    const run = vi.fn(() => d.promise)
    const deduped = dedupeInFlight(run)

    const first = deduped() // starts the real run, still pending
    const second = deduped() // arrives while in-flight

    // The old refreshInFlight-boolean version would have had the second
    // caller see a falsy/instant path here and resolve before `first`
    // does. With dedupe, both must still be pending — proven by racing
    // `second` against a same-tick no-op and confirming second has NOT
    // settled yet.
    let secondSettled = false
    void second.then(() => {
      secondSettled = true
    })
    await Promise.resolve() // flush one microtask turn
    expect(secondSettled).toBe(false)

    d.resolve('the real answer')
    await expect(first).resolves.toBe('the real answer')
    await expect(second).resolves.toBe('the real answer')
    // Exactly one underlying run for two overlapping callers.
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('a call after the in-flight one settles starts a genuinely new run', async () => {
    const run = vi.fn(async () => 'result')
    const deduped = dedupeInFlight(run)

    await deduped()
    await deduped()

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('propagates rejection to every caller sharing that run, then allows a fresh attempt', async () => {
    let attempt = 0
    const run = vi.fn(async () => {
      attempt++
      if (attempt === 1) throw new Error('boom')
      return 'recovered'
    })
    const deduped = dedupeInFlight(run)

    const a = deduped()
    const b = deduped()
    await expect(a).rejects.toThrow('boom')
    await expect(b).rejects.toThrow('boom')
    expect(run).toHaveBeenCalledTimes(1)

    await expect(deduped()).resolves.toBe('recovered')
    expect(run).toHaveBeenCalledTimes(2)
  })
})

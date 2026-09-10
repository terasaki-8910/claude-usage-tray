/**
 * Wraps an async function so overlapping calls share one in-flight
 * promise instead of each starting (or skipping) their own run.
 *
 * This exists because the original refresh guard was a boolean flag that
 * made a second caller arriving mid-refresh just no-op and return
 * immediately with whatever data existed before either call started —
 * which is exactly the bug reported: click "今すぐ更新" moments after the
 * popup's own open-triggered background refresh, and the button's own
 * request would skip its work entirely, so the spinner would stop almost
 * instantly (only the UI's minimum-spin floor) while still showing stale
 * data. A caller that arrives while a run is already in progress must
 * observe that SAME run's result, not silently see nothing happen.
 */
export function dedupeInFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null
  return () => {
    if (inFlight) return inFlight
    inFlight = run().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}

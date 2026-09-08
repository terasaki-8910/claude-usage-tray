import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Writes to a temp file in the same directory and renames over the
 * target, so a crash mid-write never leaves a torn config/state file. */
export function atomicWriteFileSync(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, data, 'utf8')
  renameSync(tmpPath, path)
}

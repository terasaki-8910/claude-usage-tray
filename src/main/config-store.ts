import { existsSync, readFileSync } from 'node:fs'
import { DEFAULT_CONFIG, type Config } from '../core/types'
import { atomicWriteFileSync } from './atomic-fs'
import { getConfigPath } from './paths'

export function loadConfig(): Config {
  const path = getConfigPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(cfg: Config): void {
  atomicWriteFileSync(getConfigPath(), JSON.stringify(cfg, null, 2))
}

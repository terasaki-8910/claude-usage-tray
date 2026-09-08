import { app } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function getStatePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

export function getLedgerPath(): string {
  return join(app.getPath('userData'), 'ledger.ndjson')
}

/** The CLI's own data file — read-only, always. Never written by this app. */
export function getClaudeJsonPath(): string {
  return join(homedir(), '.claude.json')
}

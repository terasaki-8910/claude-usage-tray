import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPingArgs, interpretPingOutput, type PingResult } from '../core/ping-args'

const SCRATCH_DIR = join(tmpdir(), 'claude-usage-tray-ping-scratch')

/**
 * Spawns the resolved `claude` executable directly (argv array, no shell —
 * see claude-cli.ts for why) in an empty scratch directory, with a hard
 * timeout as a second line of defense alongside `--max-budget-usd`
 * (which is a circuit breaker, not an exact cap — measured to overshoot).
 */
export function runPing(claudePath: string, perPingCapUsd: number, timeoutMs = 30_000): Promise<PingResult> {
  return new Promise((resolvePromise) => {
    try {
      mkdirSync(SCRATCH_DIR, { recursive: true })
    } catch {
      // best-effort; spawn will fail informatively below if this really matters
    }

    const args = buildPingArgs(perPingCapUsd)
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(claudePath, args, { cwd: SCRATCH_DIR, timeout: timeoutMs, windowsHide: true })
    } catch {
      resolvePromise({ costUsd: null, isError: true, subtype: 'spawn-threw', modelUsageKeys: [] })
      return
    }

    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.on('error', () => {
      resolvePromise({ costUsd: null, isError: true, subtype: 'spawn-error', modelUsageKeys: [] })
    })
    child.on('close', () => {
      resolvePromise(interpretPingOutput(stdout))
    })
  })
}

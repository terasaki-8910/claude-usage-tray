/**
 * The ping's argv and result-interpretation logic — deliberately pure
 * (no child_process/fs imports) so the safety-critical parts are unit
 * testable without actually spawning anything.
 */

export const PING_MODEL_ID = 'claude-haiku-4-5-20251001'
export const PING_PROMPT = 'Reply with just OK.'

/**
 * Builds the argv array for a minimal-cost, isolated ping. Always an
 * array — never assemble this into a shell string, since the budget cap
 * is config-driven and string interpolation into a shell command would be
 * an injection risk.
 *
 * `--safe-mode` is load-bearing, not a nice-to-have: measured directly,
 * omitting it (even while excluding user settings via `--setting-sources`)
 * let the user's ~20 configured MCP servers' tool schemas load into
 * context, ballooning a single call from $0.0008 to $0.086-$0.134 — a
 * >100x cost swing from one flag. `--safe-mode` also silences the user's
 * global notification hooks, so an automated ping doesn't pop a desktop
 * notification every time. `--system-prompt '.'` replaces Claude Code's
 * default system prompt, which is otherwise the dominant cost (measured:
 * 910 input + 9,822 cache-creation tokens with it vs. 256 without).
 */
export function buildPingArgs(perPingCapUsd: number): string[] {
  return [
    '--print',
    PING_PROMPT,
    '--model',
    PING_MODEL_ID,
    '--effort',
    'low',
    '--max-budget-usd',
    String(perPingCapUsd),
    '--output-format',
    'json',
    '--safe-mode',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--tools',
    '',
    '--system-prompt',
    '.'
  ]
}

interface RawPingOutput {
  total_cost_usd?: number
  is_error?: boolean
  subtype?: string
  modelUsage?: Record<string, unknown>
}

export interface PingResult {
  costUsd: number | null
  isError: boolean
  subtype: string | null
  modelUsageKeys: string[]
}

/**
 * Interprets the CLI's `--output-format json` result. Flags `isError` when
 * ANY model other than the pinned `PING_MODEL_ID` appears in `modelUsage`
 * — a silent alias/fallback to a bigger, more expensive model is exactly
 * the runaway this whole app exists to prevent, so it must never pass
 * silently even if the CLI itself reported `is_error: false`. Never
 * throws: unparseable stdout becomes an error result rather than an
 * exception in a scheduler loop.
 */
export function interpretPingOutput(stdout: string): PingResult {
  try {
    const parsed = JSON.parse(stdout) as RawPingOutput
    const modelUsageKeys = parsed.modelUsage ? Object.keys(parsed.modelUsage) : []
    const unexpectedModel = modelUsageKeys.some((k) => k !== PING_MODEL_ID)
    return {
      costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
      isError: parsed.is_error === true || unexpectedModel,
      subtype: typeof parsed.subtype === 'string' ? parsed.subtype : null,
      modelUsageKeys
    }
  } catch {
    return { costUsd: null, isError: true, subtype: 'unparseable-output', modelUsageKeys: [] }
  }
}

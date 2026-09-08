import { describe, expect, it } from 'vitest'
import { buildPingArgs, interpretPingOutput, PING_MODEL_ID } from './ping-args'

describe('buildPingArgs', () => {
  it('returns an array (never a shell string)', () => {
    expect(Array.isArray(buildPingArgs(0.02))).toBe(true)
  })

  it('includes every safety-critical flag', () => {
    const args = buildPingArgs(0.02)
    expect(args).toContain('--safe-mode')
    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--no-session-persistence')
  })

  it('pins the full model ID, never a bare alias', () => {
    const args = buildPingArgs(0.02)
    const idx = args.indexOf('--model')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe(PING_MODEL_ID)
    expect(args[idx + 1]).not.toBe('haiku')
  })

  it('disables built-in tools and replaces the default system prompt', () => {
    const args = buildPingArgs(0.02)
    const toolsIdx = args.indexOf('--tools')
    expect(args[toolsIdx + 1]).toBe('')
    const promptIdx = args.indexOf('--system-prompt')
    expect(args[promptIdx + 1]).toBe('.')
  })

  it('threads the configured per-ping budget cap through as a string', () => {
    const args = buildPingArgs(0.05)
    const idx = args.indexOf('--max-budget-usd')
    expect(args[idx + 1]).toBe('0.05')
  })
})

describe('interpretPingOutput', () => {
  it('parses a clean success result', () => {
    const stdout = JSON.stringify({
      total_cost_usd: 0.0008,
      is_error: false,
      subtype: 'success',
      modelUsage: { [PING_MODEL_ID]: { costUSD: 0.0008 } }
    })
    expect(interpretPingOutput(stdout)).toEqual({
      costUsd: 0.0008,
      isError: false,
      subtype: 'success',
      modelUsageKeys: [PING_MODEL_ID]
    })
  })

  it('flags isError when an unexpected model appears, even if is_error was false', () => {
    const stdout = JSON.stringify({
      total_cost_usd: 0.13,
      is_error: false,
      subtype: 'success',
      modelUsage: { 'claude-opus-4-5': { costUSD: 0.13 } }
    })
    expect(interpretPingOutput(stdout).isError).toBe(true)
  })

  it('flags isError when the CLI itself reported an error', () => {
    const stdout = JSON.stringify({
      total_cost_usd: 0.02,
      is_error: true,
      subtype: 'error_max_budget_usd',
      modelUsage: { [PING_MODEL_ID]: {} }
    })
    const result = interpretPingOutput(stdout)
    expect(result.isError).toBe(true)
    expect(result.subtype).toBe('error_max_budget_usd')
  })

  it('never throws on unparseable stdout, and reports it as an error', () => {
    const result = interpretPingOutput('not json at all')
    expect(result.isError).toBe(true)
    expect(result.subtype).toBe('unparseable-output')
    expect(result.costUsd).toBeNull()
  })

  it('never throws on empty stdout', () => {
    expect(() => interpretPingOutput('')).not.toThrow()
    expect(interpretPingOutput('').isError).toBe(true)
  })
})

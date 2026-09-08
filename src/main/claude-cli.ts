import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'

/**
 * Resolves the real `claude` executable path so it can be spawned directly
 * (argv array, no shell). This matters because a global npm install on
 * Windows puts TWO shims on PATH (an extensionless POSIX-style shim and a
 * `claude.cmd`) — neither is directly spawnable without `shell: true`,
 * which would reintroduce the shell-injection surface the argv-array
 * design specifically avoids. The real binary
 * (`@anthropic-ai/claude-code/bin/claude(.exe)`) lives under the npm
 * global root, which `npm root -g` reports correctly on every platform
 * (Windows: `<prefix>\node_modules`; macOS/Linux: `<prefix>/lib/node_modules`
 * — different layouts, which is why this uses `npm root -g` rather than
 * manually joining `prefix` + `node_modules`). Verified directly: spawning
 * the resolved path with `spawn(exePath, args, { windowsHide: true })`
 * (no shell) works and returns exit code 0.
 */

let cached: string | null | undefined // undefined = not yet resolved this run

function fromNpmGlobalRoot(): string | null {
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true, timeout: 10_000 }).trim()
    const bin = platform() === 'win32' ? 'claude.exe' : 'claude'
    const candidate = join(root, '@anthropic-ai', 'claude-code', 'bin', bin)
    return existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

function fromPathLookup(): string | null {
  const finder = platform() === 'win32' ? 'where' : 'which'
  try {
    const out = execFileSync(finder, ['claude'], { encoding: 'utf8', shell: true, timeout: 10_000 })
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (platform() === 'win32') {
      // Prefer a real .exe over the .cmd/extensionless shims — those need
      // shell:true to run at all, which this resolver exists to avoid.
      const exe = lines.find((l) => l.toLowerCase().endsWith('.exe'))
      return exe ?? null
    }
    // On macOS/Linux the resolved shim is typically directly executable.
    return lines[0] ?? null
  } catch {
    return null
  }
}

/**
 * Returns the resolved path to the real `claude` executable, or `null` if
 * it could not be found. Pass `overridePath` (from user settings) to skip
 * auto-resolution entirely. Caches the result for the process lifetime
 * unless the cached path stops existing (e.g. after a Claude Code
 * reinstall moved it), in which case it re-resolves once.
 */
export function resolveClaudePath(overridePath?: string | null): string | null {
  if (overridePath) {
    return existsSync(overridePath) ? overridePath : null
  }
  if (cached !== undefined && cached !== null && existsSync(cached)) {
    return cached
  }
  cached = fromNpmGlobalRoot() ?? fromPathLookup()
  return cached
}

import { spawnSync } from "node:child_process"

/**
 * Run `lifecycle <args> --json` and parse the JSON output.
 * Retries on SQLite lock contention (up to 3 attempts).
 */
export function runLifecycleJson<T>(args: string[]): T {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = spawnSync("lifecycle", [...args, "--json"], {
      encoding: "utf-8",
      timeout: 10_000,
    })

    if (result.status === 0 && result.stdout) {
      return JSON.parse(result.stdout) as T
    }

    const stderr = result.stderr?.trim() ?? ""
    const isLockError = stderr.includes("locked") || stderr.includes("Locking")
    if (isLockError && attempt < 2) {
      Bun.sleepSync(100)
      continue
    }

    throw new Error(stderr || `lifecycle exited with ${result.status}`)
  }

  throw new Error("exhausted retries")
}

export function tryLifecycleJson<T>(args: string[]): T | null {
  try {
    return runLifecycleJson<T>(args)
  } catch {
    return null
  }
}

/**
 * Run a git command in the given cwd and return trimmed stdout, or null on failure.
 */
export function gitCmd(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    timeout: 5_000,
  })
  if (result.status !== 0) return null
  return result.stdout?.trim() ?? null
}

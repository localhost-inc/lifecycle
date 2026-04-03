import { spawn, type IPty } from "bun-pty"
import { spawnSync } from "node:child_process"
import type { ShellLaunchSpec } from "./shell.js"

const MAX_BUFFER_SIZE = 512 * 1024 // 512 KB rolling buffer

export class PtySession {
  private term: IPty
  private dataCallbacks: Array<(data: string) => void> = []
  private exitCallbacks: Array<(code: number) => void> = []
  private _buffer = ""
  private _dirty = false

  constructor(spec: ShellLaunchSpec, rows: number, cols: number) {
    const env: Record<string, string> = { ...process.env } as Record<
      string,
      string
    >
    for (const [key, value] of spec.env) {
      env[key] = value
    }
    env.TERM = "xterm-256color"

    // Ensure minimum dimensions
    const safeCols = Math.max(cols, 2)
    const safeRows = Math.max(rows, 2)

    this.term = spawn(spec.program, spec.args, {
      name: "xterm-256color",
      cols: safeCols,
      rows: safeRows,
      cwd: spec.cwd ?? undefined,
      env,
    })

    this.term.onData((data: string) => {
      this._buffer += data
      if (this._buffer.length > MAX_BUFFER_SIZE) {
        this._buffer = this._buffer.slice(-MAX_BUFFER_SIZE)
      }
      this._dirty = true
      for (const cb of this.dataCallbacks) cb(data)
    })

    this.term.onExit(({ exitCode }: { exitCode: number }) => {
      for (const cb of this.exitCallbacks) cb(exitCode)
    })
  }

  /** Run a prepare step synchronously before PTY spawn. */
  static runPrepare(spec: ShellLaunchSpec): string | null {
    const result = spawnSync(spec.program, spec.args, {
      cwd: spec.cwd ?? undefined,
      encoding: "utf-8",
      env: {
        ...process.env,
        ...Object.fromEntries(spec.env),
      },
    })
    if (result.status === 0) return null
    return (
      result.stderr?.trim() ||
      result.stdout?.trim() ||
      `exit code ${result.status}`
    )
  }

  onData(cb: (data: string) => void) {
    this.dataCallbacks.push(cb)
  }

  onExit(cb: (code: number) => void) {
    this.exitCallbacks.push(cb)
  }

  write(data: string) {
    this.term.write(data)
  }

  resize(rows: number, cols: number) {
    try {
      this.term.resize(Math.max(cols, 2), Math.max(rows, 2))
    } catch {
      // Ignore resize errors after process exit
    }
  }

  get buffer(): string {
    return this._buffer
  }

  get dirty(): boolean {
    return this._dirty
  }

  clearDirty() {
    this._dirty = false
  }

  destroy() {
    try {
      this.term.kill()
    } catch {
      // Already dead
    }
  }
}

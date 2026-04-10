import { spawn, type ChildProcess } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface SpawnOptions {
  binary: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  logDir: string;
}

interface TrackedProcess {
  child: ChildProcess;
  pid: number;
  stdoutPath: string;
  stderrPath: string;
}

export class ProcessSupervisor {
  private processes = new Map<string, TrackedProcess>();

  spawn(id: string, opts: SpawnOptions): number {
    // Kill existing process with same id.
    if (this.processes.has(id)) {
      this.kill(id);
    }

    mkdirSync(opts.logDir, { recursive: true });

    // Use only the last segment of the id for the filename — the logDir
    // already scopes by stack, and the id may contain path separators.
    const fileSlug = id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
    const stdoutPath = join(opts.logDir, `${fileSlug}.stdout.log`);
    const stderrPath = join(opts.logDir, `${fileSlug}.stderr.log`);

    const stdoutFd = openSync(stdoutPath, "w");
    const stderrFd = openSync(stderrPath, "w");

    const child = spawn(opts.binary, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
    });

    const pid = child.pid ?? 0;

    // Unref so the parent process can exit without waiting for the child.
    child.unref();

    child.on("error", () => {
      this.processes.delete(id);
    });

    child.on("exit", () => {
      this.processes.delete(id);
    });

    this.processes.set(id, { child, pid, stdoutPath, stderrPath });
    return pid;
  }

  kill(id: string): boolean {
    const entry = this.processes.get(id);
    if (!entry) {
      return false;
    }

    this.processes.delete(id);

    try {
      // Kill the entire process group (negative PID).
      process.kill(-entry.pid, "SIGTERM");
    } catch {
      // Process may have already exited.
    }

    // Schedule a SIGKILL after grace period.
    setTimeout(() => {
      try {
        process.kill(-entry.pid, "SIGKILL");
      } catch {
        // Already dead.
      }
    }, 3000).unref();

    return true;
  }

  killAll(): void {
    const ids = Array.from(this.processes.keys());
    for (const id of ids) {
      this.kill(id);
    }
  }

  isAlive(id: string): boolean {
    const entry = this.processes.get(id);
    if (!entry) {
      return false;
    }

    try {
      process.kill(entry.pid, 0);
      return true;
    } catch {
      this.processes.delete(id);
      return false;
    }
  }

  pid(id: string): number | null {
    return this.processes.get(id)?.pid ?? null;
  }

  logPaths(id: string): { stdout: string; stderr: string } | null {
    const entry = this.processes.get(id);
    if (!entry) {
      return null;
    }
    return { stdout: entry.stdoutPath, stderr: entry.stderrPath };
  }

  trackedIds(): string[] {
    return [...this.processes.keys()];
  }
}

/**
 * Check if a PID is alive (works for processes not tracked by this supervisor).
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a PID by sending SIGTERM to the process group.
 */
export function killPid(pid: number): boolean {
  try {
    process.kill(-pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

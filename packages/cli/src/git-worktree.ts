import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export function createWorktree(repoPath: string, worktreePath: string, ref: string): void {
  try {
    execSync(`git worktree add ${shellQuote(worktreePath)} ${shellQuote(ref)}`, {
      cwd: repoPath,
      stdio: "pipe",
    });
  } catch {
    execSync(`git worktree add -b ${shellQuote(ref)} ${shellQuote(worktreePath)}`, {
      cwd: repoPath,
      stdio: "pipe",
    });
  }
}

export function removeWorktree(repoPath: string, worktreePath: string): void {
  try {
    execSync(`git worktree remove --force ${shellQuote(worktreePath)}`, {
      cwd: repoPath,
      stdio: "pipe",
    });
  } catch {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
      execSync("git worktree prune", { cwd: repoPath, stdio: "pipe" });
    } catch {
      // Best effort
    }
  }
}

function shellQuote(s: string): string {
  return JSON.stringify(s);
}

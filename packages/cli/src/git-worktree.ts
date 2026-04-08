import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export function createWorktree(repoPath: string, workspaceRoot: string, ref: string): void {
  try {
    execSync(`git worktree add ${shellQuote(workspaceRoot)} ${shellQuote(ref)}`, {
      cwd: repoPath,
      stdio: "pipe",
    });
  } catch {
    execSync(`git worktree add -b ${shellQuote(ref)} ${shellQuote(workspaceRoot)}`, {
      cwd: repoPath,
      stdio: "pipe",
    });
  }
}

export function removeWorktree(repoPath: string, workspaceRoot: string): void {
  try {
    execSync(`git worktree remove --force ${shellQuote(workspaceRoot)}`, {
      cwd: repoPath,
      stdio: "pipe",
    });
  } catch {
    try {
      rmSync(workspaceRoot, { recursive: true, force: true });
      execSync("git worktree prune", { cwd: repoPath, stdio: "pipe" });
    } catch {
      // Best effort
    }
  }
}

function shellQuote(s: string): string {
  return JSON.stringify(s);
}

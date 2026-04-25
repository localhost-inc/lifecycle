import type { GitFileChangeKind, GitLogEntry, GitStatusResult } from "@lifecycle/contracts";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

type InvokeArgs = Record<string, unknown> | undefined;

export async function invokeLocalWorkspaceCommand(
  cmd: string,
  args?: InvokeArgs,
): Promise<unknown> {
  switch (cmd) {
    case "get_git_current_branch":
      return getGitCurrentBranch(requireStringArg(args, "repoPath"));
    case "get_git_status":
      return getGitStatus(requireStringArg(args, "repoPath"));
    case "list_git_log":
      return listGitLog(requireStringArg(args, "repoPath"), requireNumberArg(args, "limit"));
    case "get_git_sha":
      return getGitSha(requireStringArg(args, "repoPath"), requireStringArg(args, "refName"));
    case "create_git_worktree":
      return createGitWorktree({
        repoPath: requireStringArg(args, "repoPath"),
        baseRef: requireStringArg(args, "baseRef"),
        branch: requireStringArg(args, "branch"),
        name: requireStringArg(args, "name"),
        id: requireStringArg(args, "id"),
        worktreeRoot: optionalStringArg(args, "worktreeRoot"),
        copyConfigFiles: optionalBooleanArg(args, "copyConfigFiles") ?? false,
      });
    case "resolve_lifecycle_root_path":
      return resolveLifecycleRootPath();
    case "remove_git_worktree":
      removeGitWorktree(
        requireStringArg(args, "repoPath"),
        requireStringArg(args, "workspaceRoot"),
      );
      return undefined;
    case "git_branch_has_upstream":
      return gitBranchHasUpstream(
        requireStringArg(args, "workspaceRoot"),
        requireStringArg(args, "branchName"),
      );
    case "rename_git_worktree_branch":
      return renameGitWorktreeBranch({
        workspaceRoot: requireStringArg(args, "workspaceRoot"),
        currentBranch: requireStringArg(args, "currentSourceRef"),
        newBranch: requireStringArg(args, "newSourceRef"),
        renameBranch: optionalBooleanArg(args, "renameBranch") ?? false,
        moveWorktree: optionalBooleanArg(args, "moveWorktree") ?? false,
        repoPath: requireStringArg(args, "repoPath"),
        name: requireStringArg(args, "name"),
        id: requireStringArg(args, "id"),
      });
    default:
      throw new Error(
        `LocalWorkspaceHost.invoke("${cmd}") is not available in the local bridge runtime.`,
      );
  }
}

function requireStringArg(args: InvokeArgs, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Local workspace invoke requires a non-empty string "${key}".`);
  }
  return value;
}

function optionalStringArg(args: InvokeArgs, key: string): string | null {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalBooleanArg(args: InvokeArgs, key: string): boolean | null {
  const value = args?.[key];
  return typeof value === "boolean" ? value : null;
}

function requireNumberArg(args: InvokeArgs, key: string): number {
  const value = args?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Local workspace invoke requires a finite number "${key}".`);
  }
  return value;
}

function runGit(args: string[], options: { cwd: string }): string {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || `git ${args.join(" ")} failed`).trim());
  }

  return (result.stdout ?? "").trimEnd();
}

function getGitCurrentBranch(repoPath: string): string {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoPath });
}

function getGitStatus(repoPath: string): GitStatusResult {
  const branchSummary = runGit(["status", "--porcelain=2", "--branch"], { cwd: repoPath });
  let branch: string | null = null;
  let headSha: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;

  for (const line of branchSummary.split(/\r?\n/)) {
    if (line.startsWith("# branch.head ")) {
      const value = line.slice("# branch.head ".length).trim();
      branch = value && value !== "(detached)" ? value : null;
      continue;
    }

    if (line.startsWith("# branch.oid ")) {
      const value = line.slice("# branch.oid ".length).trim();
      headSha = value && value !== "(initial)" ? value : null;
      continue;
    }

    if (line.startsWith("# branch.upstream ")) {
      const value = line.slice("# branch.upstream ".length).trim();
      upstream = value || null;
      continue;
    }

    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+)\s+-(\d+)$/);
      if (match) {
        ahead = Number.parseInt(match[1] ?? "0", 10);
        behind = Number.parseInt(match[2] ?? "0", 10);
      }
    }
  }

  const files = parseGitStatusFiles(runGit(["status", "--porcelain=1"], { cwd: repoPath }));

  return {
    branch,
    headSha,
    upstream,
    ahead,
    behind,
    files,
  };
}

function parseGitStatusFiles(output: string): GitStatusResult["files"] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith("?? ")) {
        const path = line.slice(3);
        return {
          path,
          originalPath: null,
          indexStatus: null,
          worktreeStatus: "untracked",
          staged: false,
          unstaged: true,
          stats: { insertions: null, deletions: null },
        };
      }

      if (line.startsWith("!! ")) {
        const path = line.slice(3);
        return {
          path,
          originalPath: null,
          indexStatus: null,
          worktreeStatus: "ignored",
          staged: false,
          unstaged: true,
          stats: { insertions: null, deletions: null },
        };
      }

      const xy = line.slice(0, 2);
      const rawPath = line.slice(3);
      const renameParts = rawPath.includes(" -> ") ? rawPath.split(" -> ") : null;
      const originalPath = renameParts?.[0] ?? null;
      const path = renameParts?.[1] ?? rawPath;
      const indexStatus = mapGitStatusChar(xy[0] ?? " ");
      const worktreeStatus = mapGitStatusChar(xy[1] ?? " ");

      return {
        path,
        originalPath,
        indexStatus,
        worktreeStatus,
        staged: indexStatus !== null,
        unstaged: worktreeStatus !== null,
        stats: { insertions: null, deletions: null },
      };
    });
}

function mapGitStatusChar(value: string): GitFileChangeKind | null {
  switch (value) {
    case "M":
    case "m":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "U":
      return "unmerged";
    case "?":
      return "untracked";
    case "!":
      return "ignored";
    case "T":
      return "type_changed";
    case " ":
    case ".":
      return null;
    default:
      return null;
  }
}

function listGitLog(repoPath: string, limit: number): GitLogEntry[] {
  try {
    const output = runGit(
      [
        "log",
        "-n",
        String(Math.max(0, Math.trunc(limit))),
        "--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%cI",
      ],
      { cwd: repoPath },
    );

    if (!output) {
      return [];
    }

    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, message, author, email, timestamp] = line.split("\u001f");
        return {
          sha: sha ?? "",
          shortSha: shortSha ?? "",
          message: message ?? "",
          author: author ?? "",
          email: email ?? "",
          timestamp: timestamp ?? "",
        };
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not have any commits yet")) {
      return [];
    }
    throw error;
  }
}

function getGitSha(repoPath: string, refName: string): string {
  return runGit(["rev-parse", refName], { cwd: repoPath });
}

function gitRefExists(repoPath: string, refName: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", refName], {
    cwd: repoPath,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });

  if (result.error) {
    throw result.error;
  }

  return result.status === 0;
}

function createGitWorktree(input: {
  repoPath: string;
  baseRef: string;
  branch: string;
  name: string;
  id: string;
  worktreeRoot: string | null;
  copyConfigFiles: boolean;
}): string {
  const worktreeRoot = resolveWorktreeRoot(input.repoPath, input.worktreeRoot);
  mkdirSync(worktreeRoot, { recursive: true });
  const workspaceRoot = join(worktreeRoot, worktreeDirName(input.name, input.id));
  const branchRef = `refs/heads/${input.branch}`;

  // Prune stale worktree metadata first so an existing workspace branch can
  // be reattached after its on-disk worktree was deleted.
  runGit(["worktree", "prune"], { cwd: input.repoPath });

  if (gitRefExists(input.repoPath, branchRef)) {
    runGit(["worktree", "add", workspaceRoot, input.branch], {
      cwd: input.repoPath,
    });

    if (input.copyConfigFiles) {
      try {
        copyLocalConfigFiles(input.repoPath, workspaceRoot);
      } catch (error) {
        removeGitWorktree(input.repoPath, workspaceRoot);
        throw error;
      }
    }

    return workspaceRoot;
  }

  runGit(["worktree", "add", "--detach", workspaceRoot, input.baseRef], {
    cwd: input.repoPath,
  });

  try {
    runGit(["-C", workspaceRoot, "checkout", "-b", input.branch], {
      cwd: input.repoPath,
    });
  } catch (error) {
    removeGitWorktree(input.repoPath, workspaceRoot);
    throw error;
  }

  if (input.copyConfigFiles) {
    try {
      copyLocalConfigFiles(input.repoPath, workspaceRoot);
    } catch (error) {
      removeGitWorktree(input.repoPath, workspaceRoot);
      throw error;
    }
  }

  return workspaceRoot;
}

function resolveDefaultWorktreeRoot(): string {
  return join(resolveLifecycleRootPath(), "worktrees");
}

function resolveLifecycleRootPath(): string {
  const rawRoot = process.env.LIFECYCLE_ROOT?.trim();
  if (rawRoot) {
    if (rawRoot === "~") {
      return homedir();
    }
    if (rawRoot.startsWith("~/")) {
      return join(homedir(), rawRoot.slice(2));
    }
    if (!isAbsolute(rawRoot)) {
      throw new Error("LIFECYCLE_ROOT must be an absolute path or start with ~/.");
    }
    return rawRoot;
  }
  return join(homedir(), ".lifecycle");
}

function resolveWorktreeRoot(repoPath: string, configuredRoot: string | null): string {
  if (!configuredRoot) {
    return resolveDefaultWorktreeRoot();
  }

  if (configuredRoot === "~") {
    return homedir();
  }
  if (configuredRoot.startsWith("~/")) {
    return join(homedir(), configuredRoot.slice(2));
  }
  if (isAbsolute(configuredRoot)) {
    return configuredRoot;
  }
  return join(repoPath, configuredRoot);
}

function slugifyName(value: string): string {
  let slug = "";
  let previousDash = false;

  for (const ch of value) {
    if (/^[a-z0-9]$/i.test(ch)) {
      slug += ch.toLowerCase();
      previousDash = false;
      continue;
    }

    if (" -_/.".includes(ch)) {
      if (slug && !previousDash) {
        slug += "-";
        previousDash = true;
      }
    }
  }

  while (slug.endsWith("-")) {
    slug = slug.slice(0, -1);
  }

  return slug || "unnamed";
}

function shortId(id: string): string {
  const short = Array.from(id)
    .filter((ch) => /[a-z0-9]/i.test(ch))
    .slice(0, 8)
    .join("");
  return short || "unnamed";
}

function worktreeDirName(name: string, id: string): string {
  return `${slugifyName(name)}--${shortId(id)}`;
}

function removeGitWorktree(repoPath: string, workspaceRoot: string): void {
  try {
    runGit(["worktree", "remove", "--force", workspaceRoot], { cwd: repoPath });
  } catch {
    // best effort; leave cleanup to caller/environment if git refuses
  }
}

function gitBranchHasUpstream(workspaceRoot: string, branchName: string): boolean {
  const output = runGit(
    ["-C", workspaceRoot, "for-each-ref", "--format=%(upstream:short)", `refs/heads/${branchName}`],
    { cwd: workspaceRoot },
  );
  return output.length > 0;
}

function renameGitWorktreeBranch(input: {
  workspaceRoot: string;
  currentBranch: string;
  newBranch: string;
  renameBranch: boolean;
  moveWorktree: boolean;
  repoPath: string;
  name: string;
  id: string;
}): string | null {
  if (input.renameBranch && input.currentBranch !== input.newBranch) {
    runGit(["-C", input.workspaceRoot, "branch", "-m", input.currentBranch, input.newBranch], {
      cwd: input.repoPath,
    });
  }

  if (!input.moveWorktree) {
    return null;
  }

  const nextPath = join(dirname(input.workspaceRoot), worktreeDirName(input.name, input.id));
  if (nextPath === input.workspaceRoot) {
    return nextPath;
  }
  if (existsSync(nextPath)) {
    throw new Error(`target worktree path already exists: ${nextPath}`);
  }

  runGit(["worktree", "move", input.workspaceRoot, nextPath], {
    cwd: input.repoPath,
  });

  return nextPath;
}

function copyLocalConfigFiles(repoPath: string, workspaceRoot: string): void {
  const dotfiles = [".env", ".env.local", ".mise.toml"];

  for (const name of dotfiles) {
    const src = join(repoPath, name);
    if (existsSync(src)) {
      cpSync(src, join(workspaceRoot, name));
    }
  }

  const vscodeSrc = join(repoPath, ".vscode");
  if (existsSync(vscodeSrc)) {
    mkdirSync(join(workspaceRoot, ".vscode"), { recursive: true });
    for (const entry of readdirSync(vscodeSrc)) {
      cpSync(join(vscodeSrc, entry), join(workspaceRoot, ".vscode", entry), { recursive: true });
    }
  }
}

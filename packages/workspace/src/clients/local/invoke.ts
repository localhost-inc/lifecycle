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
      removeGitWorktree(requireStringArg(args, "repoPath"), requireStringArg(args, "workspaceRoot"));
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
        `LocalWorkspaceClient.invoke("${cmd}") is not available in the local bridge runtime.`,
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

  return (result.stdout ?? "").trim();
}

function getGitCurrentBranch(repoPath: string): string {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoPath });
}

function getGitSha(repoPath: string, refName: string): string {
  return runGit(["rev-parse", refName], { cwd: repoPath });
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
  const dotfiles = [
    ".env",
    ".env.local",
    ".mise.toml",
  ];

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

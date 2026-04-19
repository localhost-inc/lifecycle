import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { invokeLocalWorkspaceCommand } from "./invoke";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function runGit(repoPath: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_AUTHOR_NAME: "Lifecycle Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Lifecycle Test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe("invokeLocalWorkspaceCommand", () => {
  test("returns local git status and commit log for a workspace repo", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-local-invoke-"));
    tempDirs.push(dir);

    const repoPath = join(dir, "repo");
    await mkdir(repoPath, { recursive: true });

    runGit(repoPath, ["init", "-b", "main"]);
    await writeFile(join(repoPath, "README.md"), "hello\n", "utf8");
    runGit(repoPath, ["add", "README.md"]);
    runGit(repoPath, ["commit", "-m", "init"]);

    await writeFile(join(repoPath, "README.md"), "hello world\n", "utf8");
    await writeFile(join(repoPath, "notes.txt"), "draft\n", "utf8");

    const status = (await invokeLocalWorkspaceCommand("get_git_status", {
      repoPath,
    })) as {
      branch: string | null;
      headSha: string | null;
      upstream: string | null;
      ahead: number;
      behind: number;
      files: Array<{
        path: string;
        indexStatus: string | null;
        worktreeStatus: string | null;
        staged: boolean;
        unstaged: boolean;
      }>;
    };
    const log = (await invokeLocalWorkspaceCommand("list_git_log", {
      repoPath,
      limit: 10,
    })) as Array<{
      shortSha: string;
      message: string;
      author: string;
      email: string;
    }>;

    expect(status.branch).toBe("main");
    expect(status.headSha).not.toBeNull();
    expect(status.upstream).toBeNull();
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    expect(status.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "README.md",
          indexStatus: null,
          worktreeStatus: "modified",
          staged: false,
          unstaged: true,
        }),
        expect.objectContaining({
          path: "notes.txt",
          indexStatus: null,
          worktreeStatus: "untracked",
          staged: false,
          unstaged: true,
        }),
      ]),
    );

    expect(log).toEqual([
      expect.objectContaining({
        message: "init",
        author: "Lifecycle Test",
        email: "test@example.com",
      }),
    ]);
    expect(log[0]?.shortSha.length).toBeGreaterThan(0);
  });

  test("re-attaches an existing workspace branch after a stale worktree is pruned", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-local-invoke-"));
    tempDirs.push(dir);

    const repoPath = join(dir, "repo");
    await mkdir(repoPath, { recursive: true });

    runGit(repoPath, ["init", "-b", "main"]);
    await writeFile(join(repoPath, "README.md"), "hello\n", "utf8");
    runGit(repoPath, ["add", "README.md"]);
    runGit(repoPath, ["commit", "-m", "init"]);
    runGit(repoPath, ["branch", "feature/restore"]);

    const staleWorkspaceRoot = join(dir, "stale", "feature-restore--ws1");
    await mkdir(join(dir, "stale"), { recursive: true });
    runGit(repoPath, ["worktree", "add", staleWorkspaceRoot, "feature/restore"]);
    await rm(staleWorkspaceRoot, { recursive: true, force: true });

    const restoredWorkspaceRoot = (await invokeLocalWorkspaceCommand("create_git_worktree", {
      repoPath,
      baseRef: "main",
      branch: "feature/restore",
      name: "Feature Restore",
      id: "ws_1",
      worktreeRoot: join(dir, "worktrees"),
      copyConfigFiles: false,
    })) as string;

    await access(restoredWorkspaceRoot);
    expect(restoredWorkspaceRoot).toBe(join(dir, "worktrees", "feature-restore--ws1"));
    expect(runGit(repoPath, ["-C", restoredWorkspaceRoot, "branch", "--show-current"])).toBe(
      "feature/restore",
    );
  });
});

import { describe, expect, test } from "bun:test";
import type { GitPullRequestSummary } from "@lifecycle/contracts";
import type { StorageLike } from "./workspace-surface-state";
import {
  changesDiffTabKey,
  clearLastWorkspaceId,
  commitDiffTabKey,
  createChangesDiffTab,
  createCommitDiffTab,
  createDefaultWorkspaceSurfaceState,
  createFileViewerTab,
  createLauncherTab,
  createPullRequestTab,
  fileViewerTabKey,
  pullRequestTabKey,
  readLastWorkspaceId,
  readWorkspaceSurfaceState,
  writeLastWorkspaceId,
  writeWorkspaceSurfaceState,
} from "./workspace-surface-state";

const WORKSPACE_SURFACE_STATE_STORAGE_KEY = "lifecycle.desktop.workspace-surface";
const CHANGES_DIFF_TAB_KEY = changesDiffTabKey();

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function withDefaultState(state: Partial<ReturnType<typeof createDefaultWorkspaceSurfaceState>>) {
  return {
    ...createDefaultWorkspaceSurfaceState(),
    ...state,
  };
}

function createCommitEntry(overrides: Partial<ReturnType<typeof createCommitDiffTab>> = {}) {
  return {
    author: "Lifecycle",
    message: "feat: add unified diff tabs",
    sha: "0123456789abcdef0123456789abcdef01234567",
    shortSha: "01234567",
    timestamp: "2026-03-07T12:00:00.000Z",
    ...overrides,
  };
}

function createPullRequestSummary(
  overrides: Partial<GitPullRequestSummary> = {},
): GitPullRequestSummary {
  return {
    author: "kyle",
    baseRefName: "main",
    checks: null,
    createdAt: "2026-03-10T10:00:00.000Z",
    headRefName: "feature/pull-request-surface",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    mergeable: "mergeable",
    number: 42,
    reviewDecision: "approved",
    state: "open",
    title: "feat: add pull request surface",
    updatedAt: "2026-03-10T11:00:00.000Z",
    url: "https://github.com/example/repo/pull/42",
    ...overrides,
  };
}

describe("workspace surface state persistence", () => {
  test("restores only the current kind-based document schema", () => {
    const storage = new MemoryStorage();
    const commit = createCommitEntry();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY,
      JSON.stringify({
        "ws-1": {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          documents: [
            {
              focusPath: "src/app.ts",
              kind: "changes-diff",
            },
            {
              author: commit.author,
              kind: "commit-diff",
              message: commit.message,
              sha: commit.sha,
              shortSha: commit.shortSha,
              timestamp: commit.timestamp,
            },
            {
              filePath: "README.md",
            },
            {
              kind: "obsolete-document",
              filePath: "README.md",
            },
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("src/app.ts"), createCommitDiffTab(commit)],
    });
  });

  test("persists a single changes diff tab with fixed labeling and focus path", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.ts"), createChangesDiffTab("README.md")],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("README.md")],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [
          {
            focusPath: "README.md",
            kind: "changes-diff",
          },
        ],
      },
    });
  });

  test("persists commit diff tabs with sha-based dedupe", () => {
    const storage = new MemoryStorage();
    const firstCommit = createCommitEntry();
    const secondCommit = createCommitEntry({
      author: "Another Author",
      message: "fix: keep commit tab metadata",
      sha: "fedcba9876543210fedcba9876543210fedcba98",
      shortSha: "fedcba98",
      timestamp: "2026-03-06T10:30:00.000Z",
    });

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: commitDiffTabKey(firstCommit.sha),
        documents: [
          createCommitDiffTab(firstCommit),
          createCommitDiffTab(secondCommit),
          createCommitDiffTab(firstCommit),
        ],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: commitDiffTabKey(firstCommit.sha),
      documents: [createCommitDiffTab(firstCommit), createCommitDiffTab(secondCommit)],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: commitDiffTabKey(firstCommit.sha),
        documents: [
          {
            author: firstCommit.author,
            kind: "commit-diff",
            message: firstCommit.message,
            sha: firstCommit.sha,
            shortSha: firstCommit.shortSha,
            timestamp: firstCommit.timestamp,
          },
          {
            author: secondCommit.author,
            kind: "commit-diff",
            message: secondCommit.message,
            sha: secondCommit.sha,
            shortSha: secondCommit.shortSha,
            timestamp: secondCommit.timestamp,
          },
        ],
      },
    });
  });

  test("persists file viewer tabs with normalized repo-relative paths", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: fileViewerTabKey("./docs/../README.md"),
        documents: [createFileViewerTab("./docs/../README.md"), createFileViewerTab("README.md")],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: fileViewerTabKey("README.md"),
      documents: [createFileViewerTab("README.md")],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [
          {
            filePath: "README.md",
            kind: "file-viewer",
          },
        ],
      },
    });
  });

  test("persists per-tab view state for reopened document tabs", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [createFileViewerTab("README.md")],
        viewStateByTabKey: {
          [fileViewerTabKey("README.md")]: {
            scrollTop: 128,
          },
          "terminal:term-1": {
            scrollTop: 64,
          },
        },
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: fileViewerTabKey("README.md"),
      documents: [createFileViewerTab("README.md")],
      viewStateByTabKey: {
        [fileViewerTabKey("README.md")]: {
          scrollTop: 128,
        },
      },
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [
          {
            filePath: "README.md",
            kind: "file-viewer",
          },
        ],
        viewStateByTabKey: {
          [fileViewerTabKey("README.md")]: {
            scrollTop: 128,
          },
        },
      },
    });
  });

  test("persists pull request tabs with number-based dedupe", () => {
    const storage = new MemoryStorage();
    const firstPullRequest = createPullRequestSummary();
    const secondPullRequest = createPullRequestSummary({
      checks: [
        {
          detailsUrl: "https://github.com/example/repo/actions/runs/42",
          name: "CI",
          status: "success",
          workflowName: "ci",
        },
      ],
      mergeStateStatus: "HAS_HOOKS",
      title: "feat: add pull request surface polish",
      updatedAt: "2026-03-10T12:30:00.000Z",
    });

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: pullRequestTabKey(firstPullRequest.number),
        documents: [
          createPullRequestTab(firstPullRequest),
          createPullRequestTab(secondPullRequest),
        ],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: pullRequestTabKey(firstPullRequest.number),
      documents: [createPullRequestTab(secondPullRequest)],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: pullRequestTabKey(firstPullRequest.number),
        documents: [
          {
            author: secondPullRequest.author,
            baseRefName: secondPullRequest.baseRefName,
            checks: secondPullRequest.checks,
            createdAt: secondPullRequest.createdAt,
            headRefName: secondPullRequest.headRefName,
            isDraft: secondPullRequest.isDraft,
            mergeStateStatus: secondPullRequest.mergeStateStatus,
            mergeable: secondPullRequest.mergeable,
            number: secondPullRequest.number,
            reviewDecision: secondPullRequest.reviewDecision,
            state: secondPullRequest.state,
            title: secondPullRequest.title,
            kind: "pull-request",
            updatedAt: secondPullRequest.updatedAt,
            url: secondPullRequest.url,
          },
        ],
      },
    });
  });

  test("persists runtime active tabs even when no document tabs are open", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: "terminal:term-42",
        documents: [],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: "terminal:term-42",
      documents: [],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: "terminal:term-42",
        documents: [],
      },
    });
  });

  test("preserves launcher tabs alongside workspace-owned tab ordering", () => {
    const storage = new MemoryStorage();
    const launcher = createLauncherTab("launcher-1");

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: launcher.key,
        documents: [launcher, createChangesDiffTab("src/app.ts")],
        tabOrderKeys: [launcher.key, CHANGES_DIFF_TAB_KEY, "terminal:term-2"],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: launcher.key,
      documents: [launcher, createChangesDiffTab("src/app.ts")],
      hiddenRuntimeTabKeys: [],
      tabOrderKeys: [launcher.key, CHANGES_DIFF_TAB_KEY, "terminal:term-2"],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: launcher.key,
        documents: [
          {
            key: launcher.key,
            kind: "launcher",
          },
          {
            focusPath: "src/app.ts",
            kind: "changes-diff",
          },
        ],
        tabOrderKeys: [launcher.key, CHANGES_DIFF_TAB_KEY, "terminal:term-2"],
      },
    });
  });

  test("keeps hidden runtime tabs separate from visible order and clears invalid active runtime keys", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "terminal:term-hidden",
          documents: [createLauncherTab("launcher-1")],
          hiddenRuntimeTabKeys: ["terminal:term-hidden", "launcher:ignored"],
          tabOrderKeys: ["launcher:launcher-1", "terminal:term-hidden", CHANGES_DIFF_TAB_KEY],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: null,
      documents: [createLauncherTab("launcher-1")],
      hiddenRuntimeTabKeys: ["terminal:term-hidden"],
      tabOrderKeys: ["launcher:launcher-1", CHANGES_DIFF_TAB_KEY],
    });
  });

  test("filters invalid persisted payloads while preserving valid current documents", () => {
    const storage = new MemoryStorage();
    const commit = createCommitEntry();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY,
      JSON.stringify({
        "ws-1": {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          documents: [
            {
              kind: "changes-diff",
              focusPath: "src/existing.ts",
            },
            {
              filePath: "src/app.ts",
            },
            {
              kind: "obsolete-document",
              filePath: "README.md",
            },
            {
              kind: "obsolete-document",
              filePath: 42,
            },
            {
              author: commit.author,
              kind: "commit-diff",
              message: commit.message,
              sha: commit.sha,
              shortSha: commit.shortSha,
              timestamp: commit.timestamp,
            },
            { kind: "commit-diff", sha: "" },
            { kind: "commit-diff", sha: 42 },
            {
              author: 42,
              kind: "commit-diff",
              message: "bad author",
              sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
              shortSha: "deadbeef",
              timestamp: "2026-03-07T13:00:00.000Z",
            },
            null,
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("src/existing.ts"), createCommitDiffTab(commit)],
    });
  });

  test("preserves persisted runtime active tabs while filtering invalid documents", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "terminal:term-42",
          documents: [
            {
              kind: "obsolete-document",
              filePath: 42,
            },
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: "terminal:term-42",
      documents: [],
    });
  });

  test("removes empty workspace state snapshots", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.ts")],
      }),
      storage,
    );
    writeWorkspaceSurfaceState("ws-1", createDefaultWorkspaceSurfaceState(), storage);

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      createDefaultWorkspaceSurfaceState(),
    );
    expect(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY)).toBeNull();
  });

  test("persists and clears the last selected workspace id", () => {
    const storage = new MemoryStorage();

    expect(readLastWorkspaceId(storage)).toBeNull();

    writeLastWorkspaceId("ws-9", storage);
    expect(readLastWorkspaceId(storage)).toBe("ws-9");

    clearLastWorkspaceId(storage);
    expect(readLastWorkspaceId(storage)).toBeNull();
  });
});

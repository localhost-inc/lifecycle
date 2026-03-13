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
  createPullRequestTab,
  fileViewerTabKey,
  pullRequestTabKey,
  readLastWorkspaceId,
  readWorkspaceSurfaceState,
  type WorkspaceSurfaceState,
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

function withDefaultState(
  state: Partial<WorkspaceSurfaceState> & {
    activeTabKey?: string | null;
    tabOrderKeys?: string[];
  },
): WorkspaceSurfaceState {
  const base = createDefaultWorkspaceSurfaceState();
  const baseRootPane = base.rootPane.kind === "leaf" ? base.rootPane : null;
  const { activeTabKey = null, tabOrderKeys = [], ...rest } = state;

  return {
    ...base,
    ...rest,
    rootPane: {
      activeTabKey,
      id: baseRootPane?.id ?? "pane-root",
      kind: "leaf",
      tabOrderKeys,
    },
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.ts"), createCommitDiffTab(commit)],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("README.md")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [
          {
            focusPath: "README.md",
            kind: "changes-diff",
          },
        ],
        rootPane: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: commitDiffTabKey(firstCommit.sha),
        documents: [createCommitDiffTab(firstCommit), createCommitDiffTab(secondCommit)],
        tabOrderKeys: [commitDiffTabKey(firstCommit.sha)],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
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
        rootPane: {
          activeTabKey: commitDiffTabKey(firstCommit.sha),
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [commitDiffTabKey(firstCommit.sha)],
        },
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [createFileViewerTab("README.md")],
        tabOrderKeys: [fileViewerTabKey("README.md")],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [
          {
            filePath: "README.md",
            kind: "file-viewer",
          },
        ],
        rootPane: {
          activeTabKey: fileViewerTabKey("README.md"),
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [fileViewerTabKey("README.md")],
        },
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [createFileViewerTab("README.md")],
        tabOrderKeys: [fileViewerTabKey("README.md")],
        viewStateByTabKey: {
          [fileViewerTabKey("README.md")]: {
            scrollTop: 128,
          },
        },
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [
          {
            filePath: "README.md",
            kind: "file-viewer",
          },
        ],
        rootPane: {
          activeTabKey: fileViewerTabKey("README.md"),
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [fileViewerTabKey("README.md")],
        },
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: pullRequestTabKey(firstPullRequest.number),
        documents: [createPullRequestTab(secondPullRequest)],
        tabOrderKeys: [pullRequestTabKey(firstPullRequest.number)],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
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
        rootPane: {
          activeTabKey: pullRequestTabKey(firstPullRequest.number),
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [pullRequestTabKey(firstPullRequest.number)],
        },
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: "terminal:term-42",
        documents: [],
        tabOrderKeys: ["terminal:term-42"],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [],
        rootPane: {
          activeTabKey: "terminal:term-42",
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: ["terminal:term-42"],
        },
      },
    });
  });

  test("persists split pane ratios as part of the workspace pane tree", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      {
        ...createDefaultWorkspaceSurfaceState(),
        activePaneId: "pane-2",
        documents: [createChangesDiffTab("src/app.ts")],
        hiddenRuntimeTabKeys: [],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: null,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.62,
          second: {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            id: "pane-2",
            kind: "leaf",
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
        },
        viewStateByTabKey: {},
      },
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activePaneId: "pane-2",
      documents: [createChangesDiffTab("src/app.ts")],
      hiddenRuntimeTabKeys: [],
      rootPane: {
        direction: "row",
        first: {
          activeTabKey: null,
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [],
        },
        id: "split-1",
        kind: "split",
        ratio: 0.62,
        second: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-2",
          kind: "leaf",
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
      },
      viewStateByTabKey: {},
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-2",
        documents: [
          {
            focusPath: "src/app.ts",
            kind: "changes-diff",
          },
        ],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: null,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.62,
          second: {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            id: "pane-2",
            kind: "leaf",
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
        },
      },
    });
  });

  test("normalizes invalid persisted split ratios back to a centered split", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY,
      JSON.stringify({
        "ws-1": {
          activePaneId: "pane-2",
          documents: [
            {
              focusPath: "src/app.ts",
              kind: "changes-diff",
            },
          ],
          rootPane: {
            direction: "row",
            first: {
              activeTabKey: null,
              id: "pane-root",
              kind: "leaf",
              tabOrderKeys: [],
            },
            id: "split-1",
            kind: "split",
            ratio: 99,
            second: {
              activeTabKey: CHANGES_DIFF_TAB_KEY,
              id: "pane-2",
              kind: "leaf",
              tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
            },
          },
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activePaneId: "pane-2",
      documents: [createChangesDiffTab("src/app.ts")],
      hiddenRuntimeTabKeys: [],
      rootPane: {
        direction: "row",
        first: {
          activeTabKey: null,
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [],
        },
        id: "split-1",
        kind: "split",
        ratio: 0.5,
        second: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-2",
          kind: "leaf",
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
      },
      viewStateByTabKey: {},
    });
  });

  test("drops persisted launcher tabs and keys while keeping runtime hidden state", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "terminal:term-hidden",
          documents: [
            {
              key: "launcher:launcher-1",
              kind: "launcher",
            },
          ],
          hiddenRuntimeTabKeys: ["terminal:term-hidden", "launcher:ignored"],
          tabOrderKeys: ["launcher:launcher-1", "terminal:term-hidden", CHANGES_DIFF_TAB_KEY],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: null,
        documents: [],
        hiddenRuntimeTabKeys: ["terminal:term-hidden"],
        tabOrderKeys: [],
      }),
    );
  });

  test("preserves an empty split layout instead of deleting it as a blank workspace", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      {
        ...createDefaultWorkspaceSurfaceState(),
        activePaneId: "pane-2",
        documents: [],
        hiddenRuntimeTabKeys: [],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: null,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.62,
          second: {
            activeTabKey: null,
            id: "pane-2",
            kind: "leaf",
            tabOrderKeys: [],
          },
        },
        viewStateByTabKey: {},
      },
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activePaneId: "pane-2",
      documents: [],
      hiddenRuntimeTabKeys: [],
      rootPane: {
        direction: "row",
        first: {
          activeTabKey: null,
          id: "pane-root",
          kind: "leaf",
          tabOrderKeys: [],
        },
        id: "split-1",
        kind: "split",
        ratio: 0.62,
        second: {
          activeTabKey: null,
          id: "pane-2",
          kind: "leaf",
          tabOrderKeys: [],
        },
      },
      viewStateByTabKey: {},
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/existing.ts"), createCommitDiffTab(commit)],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
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

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: "terminal:term-42",
        documents: [],
        tabOrderKeys: ["terminal:term-42"],
      }),
    );
  });

  test("removes empty workspace state snapshots", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.ts")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
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

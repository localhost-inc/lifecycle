import { describe, expect, test } from "bun:test";
import type { GitPullRequestSummary } from "@lifecycle/contracts";
import type { StorageLike } from "./workspace-canvas-state";
import {
  changesDiffTabKey,
  clearLastWorkspaceId,
  commitDiffTabKey,
  createChangesDiffTab,
  createCommitDiffTab,
  createDefaultWorkspaceCanvasState,
  createFileViewerTab,
  createPullRequestTab,
  fileViewerTabKey,
  pullRequestTabKey,
  readLastWorkspaceId,
  readWorkspaceCanvasState,
  type WorkspaceCanvasTabViewState,
  type WorkspaceCanvasDocument,
  type WorkspaceCanvasState,
  writeLastWorkspaceId,
  writeWorkspaceCanvasState,
} from "./workspace-canvas-state";

const WORKSPACE_CANVAS_STATE_STORAGE_KEY = "lifecycle.desktop.workspace-surface";
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

function indexDocuments(
  documents: readonly WorkspaceCanvasDocument[],
): WorkspaceCanvasState["documentsByKey"] {
  return Object.fromEntries(documents.map((document) => [document.key, document]));
}

type TestWorkspacePaneNode =
  | {
      activeTabKey?: string | null;
      id: string;
      kind: "leaf";
      tabOrderKeys?: string[];
    }
  | {
      direction: "column" | "row";
      first: TestWorkspacePaneNode;
      id: string;
      kind: "split";
      ratio: number;
      second: TestWorkspacePaneNode;
    };

function buildPaneTreeState(
  rootPane: TestWorkspacePaneNode,
): Pick<WorkspaceCanvasState, "paneTabStateById" | "rootPane"> {
  if (rootPane.kind === "leaf") {
    return {
      paneTabStateById: {
        [rootPane.id]: {
          activeTabKey: rootPane.activeTabKey ?? null,
          tabOrderKeys: rootPane.tabOrderKeys ?? [],
        },
      },
      rootPane: {
        id: rootPane.id,
        kind: "leaf",
      },
    };
  }

  const first = buildPaneTreeState(rootPane.first);
  const second = buildPaneTreeState(rootPane.second);
  return {
    paneTabStateById: {
      ...first.paneTabStateById,
      ...second.paneTabStateById,
    },
    rootPane: {
      direction: rootPane.direction,
      first: first.rootPane,
      id: rootPane.id,
      kind: "split",
      ratio: rootPane.ratio,
      second: second.rootPane,
    },
  };
}

function withWorkspaceState(
  state: Omit<
    WorkspaceCanvasState,
    "documentsByKey" | "paneTabStateById" | "rootPane" | "tabStateByKey"
  > & {
    documents?: WorkspaceCanvasDocument[];
    hiddenRuntimeTabKeys?: string[];
    rootPane?: TestWorkspacePaneNode;
    viewStateByTabKey?: Record<string, WorkspaceCanvasTabViewState>;
  },
): WorkspaceCanvasState {
  const {
    documents = [],
    hiddenRuntimeTabKeys = [],
    rootPane,
    viewStateByTabKey = {},
    ...rest
  } = state;
  const base = createDefaultWorkspaceCanvasState();
  const paneTreeState = rootPane
    ? buildPaneTreeState(rootPane)
    : {
        paneTabStateById: base.paneTabStateById,
        rootPane: base.rootPane,
      };

  return {
    ...rest,
    documentsByKey: indexDocuments(documents),
    paneTabStateById: paneTreeState.paneTabStateById,
    rootPane: paneTreeState.rootPane,
    tabStateByKey: Object.fromEntries([
      ...hiddenRuntimeTabKeys.map((key) => [key, { hidden: true }] as const),
      ...Object.entries(viewStateByTabKey).map(([key, viewState]) => [
        key,
        {
          ...(hiddenRuntimeTabKeys.includes(key) ? { hidden: true } : {}),
          viewState,
        },
      ]),
    ]),
  };
}

function withDefaultState(
  state: Partial<WorkspaceCanvasState> & {
    activeTabKey?: string | null;
    documents?: WorkspaceCanvasDocument[];
    hiddenRuntimeTabKeys?: string[];
    tabOrderKeys?: string[];
    viewStateByTabKey?: Record<string, WorkspaceCanvasTabViewState>;
  },
): WorkspaceCanvasState {
  const base = createDefaultWorkspaceCanvasState();
  const baseRootPane = base.rootPane.kind === "leaf" ? base.rootPane : null;
  const {
    activeTabKey = null,
    documents = [],
    hiddenRuntimeTabKeys = [],
    tabOrderKeys = [],
    viewStateByTabKey = {},
    ...rest
  } = state;

  return {
    ...base,
    ...rest,
    documentsByKey: indexDocuments(documents),
    paneTabStateById: {
      [baseRootPane?.id ?? "pane-root"]: {
        activeTabKey,
        tabOrderKeys,
      },
    },
    tabStateByKey: Object.fromEntries([
      ...hiddenRuntimeTabKeys.map((key) => [key, { hidden: true }] as const),
      ...Object.entries(viewStateByTabKey).map(([key, viewState]) => [
        key,
        {
          ...(hiddenRuntimeTabKeys.includes(key) ? { hidden: true } : {}),
          viewState,
        },
      ]),
    ]),
    rootPane: {
      id: baseRootPane?.id ?? "pane-root",
      kind: "leaf",
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

describe("workspace canvas state persistence", () => {
  test("restores only the current document schema when legacy pane metadata is absent", () => {
    const storage = new MemoryStorage();
    const commit = createCommitEntry();

    storage.setItem(
      WORKSPACE_CANVAS_STATE_STORAGE_KEY,
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

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        documents: [createChangesDiffTab("src/app.ts"), createCommitDiffTab(commit)],
      }),
    );
  });

  test("persists a single changes diff tab with fixed labeling and focus path", () => {
    const storage = new MemoryStorage();

    writeWorkspaceCanvasState(
      "ws-1",
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.ts"), createChangesDiffTab("README.md")],
      }),
      storage,
    );

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("README.md")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [
          {
            focusPath: "README.md",
            kind: "changes-diff",
          },
        ],
        paneTabStateById: {
          "pane-root": {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
        },
        rootPane: {
          id: "pane-root",
          kind: "leaf",
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

    writeWorkspaceCanvasState(
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

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: commitDiffTabKey(firstCommit.sha),
        documents: [createCommitDiffTab(firstCommit), createCommitDiffTab(secondCommit)],
        tabOrderKeys: [commitDiffTabKey(firstCommit.sha)],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? "null")).toEqual({
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
        paneTabStateById: {
          "pane-root": {
            activeTabKey: commitDiffTabKey(firstCommit.sha),
            tabOrderKeys: [commitDiffTabKey(firstCommit.sha)],
          },
        },
        rootPane: {
          id: "pane-root",
          kind: "leaf",
        },
      },
    });
  });

  test("persists file viewer tabs with normalized repo-relative paths", () => {
    const storage = new MemoryStorage();

    writeWorkspaceCanvasState(
      "ws-1",
      withDefaultState({
        activeTabKey: fileViewerTabKey("./docs/../README.md"),
        documents: [createFileViewerTab("./docs/../README.md"), createFileViewerTab("README.md")],
      }),
      storage,
    );

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [createFileViewerTab("README.md")],
        tabOrderKeys: [fileViewerTabKey("README.md")],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [
          {
            filePath: "README.md",
            kind: "file-viewer",
          },
        ],
        paneTabStateById: {
          "pane-root": {
            activeTabKey: fileViewerTabKey("README.md"),
            tabOrderKeys: [fileViewerTabKey("README.md")],
          },
        },
        rootPane: {
          id: "pane-root",
          kind: "leaf",
        },
      },
    });
  });

  test("persists per-tab view state for reopened document tabs", () => {
    const storage = new MemoryStorage();

    writeWorkspaceCanvasState(
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

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
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
    expect(JSON.parse(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [
          {
            filePath: "README.md",
            kind: "file-viewer",
          },
        ],
        paneTabStateById: {
          "pane-root": {
            activeTabKey: fileViewerTabKey("README.md"),
            tabOrderKeys: [fileViewerTabKey("README.md")],
          },
        },
        rootPane: {
          id: "pane-root",
          kind: "leaf",
        },
        tabStateByKey: {
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

    writeWorkspaceCanvasState(
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

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: pullRequestTabKey(firstPullRequest.number),
        documents: [createPullRequestTab(secondPullRequest)],
        tabOrderKeys: [pullRequestTabKey(firstPullRequest.number)],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? "null")).toEqual({
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
        paneTabStateById: {
          "pane-root": {
            activeTabKey: pullRequestTabKey(firstPullRequest.number),
            tabOrderKeys: [pullRequestTabKey(firstPullRequest.number)],
          },
        },
        rootPane: {
          id: "pane-root",
          kind: "leaf",
        },
      },
    });
  });

  test("persists runtime active tabs even when no document tabs are open", () => {
    const storage = new MemoryStorage();

    writeWorkspaceCanvasState(
      "ws-1",
      withDefaultState({
        activeTabKey: "terminal:term-42",
        documents: [],
      }),
      storage,
    );

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: "terminal:term-42",
        documents: [],
        tabOrderKeys: ["terminal:term-42"],
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-root",
        documents: [],
        paneTabStateById: {
          "pane-root": {
            activeTabKey: "terminal:term-42",
            tabOrderKeys: ["terminal:term-42"],
          },
        },
        rootPane: {
          id: "pane-root",
          kind: "leaf",
        },
      },
    });
  });

  test("persists split pane ratios as part of the workspace pane tree", () => {
    const storage = new MemoryStorage();

    writeWorkspaceCanvasState(
      "ws-1",
      withWorkspaceState({
        ...createDefaultWorkspaceCanvasState(),
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
      }),
      storage,
    );

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withWorkspaceState({
        ...createDefaultWorkspaceCanvasState(),
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
      }),
    );
    expect(JSON.parse(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? "null")).toEqual({
      "ws-1": {
        activePaneId: "pane-2",
        documents: [
          {
            focusPath: "src/app.ts",
            kind: "changes-diff",
          },
        ],
        paneTabStateById: {
          "pane-root": {
            activeTabKey: null,
            tabOrderKeys: [],
          },
          "pane-2": {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
        },
        rootPane: {
          direction: "row",
          first: {
            id: "pane-root",
            kind: "leaf",
          },
          id: "split-1",
          kind: "split",
          ratio: 0.62,
          second: {
            id: "pane-2",
            kind: "leaf",
          },
        },
      },
    });
  });

  test("normalizes invalid persisted split ratios back to a centered split", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_CANVAS_STATE_STORAGE_KEY,
      JSON.stringify({
        "ws-1": {
          activePaneId: "pane-2",
          documents: [
            {
              focusPath: "src/app.ts",
              kind: "changes-diff",
            },
          ],
          paneTabStateById: {
            "pane-root": {
              activeTabKey: null,
              tabOrderKeys: [],
            },
            "pane-2": {
              activeTabKey: CHANGES_DIFF_TAB_KEY,
              tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
            },
          },
          rootPane: {
            direction: "row",
            first: {
              id: "pane-root",
              kind: "leaf",
            },
            id: "split-1",
            kind: "split",
            ratio: 99,
            second: {
              id: "pane-2",
              kind: "leaf",
            },
          },
        },
      }),
    );

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withWorkspaceState({
        ...createDefaultWorkspaceCanvasState(),
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
      }),
    );
  });

  test("drops persisted launcher tabs and legacy hidden runtime metadata", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_CANVAS_STATE_STORAGE_KEY,
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

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        activeTabKey: null,
        documents: [],
        tabOrderKeys: [],
      }),
    );
  });

  test("preserves an empty split layout instead of deleting it as a blank workspace", () => {
    const storage = new MemoryStorage();

    writeWorkspaceCanvasState(
      "ws-1",
      withWorkspaceState({
        ...createDefaultWorkspaceCanvasState(),
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
      }),
      storage,
    );

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withWorkspaceState({
        ...createDefaultWorkspaceCanvasState(),
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
      }),
    );
  });

  test("filters invalid persisted payloads while preserving valid current documents", () => {
    const storage = new MemoryStorage();
    const commit = createCommitEntry();

    storage.setItem(
      WORKSPACE_CANVAS_STATE_STORAGE_KEY,
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

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        documents: [createChangesDiffTab("src/existing.ts"), createCommitDiffTab(commit)],
      }),
    );
  });

  test("drops legacy root-pane-less runtime tab metadata while filtering invalid documents", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_CANVAS_STATE_STORAGE_KEY,
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

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      withDefaultState({
        documents: [],
      }),
    );
  });

  test("removes empty workspace state snapshots", () => {
    const storage = new MemoryStorage();

    writeWorkspaceCanvasState(
      "ws-1",
      withDefaultState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.ts")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
      storage,
    );
    writeWorkspaceCanvasState("ws-1", createDefaultWorkspaceCanvasState(), storage);

    expect(readWorkspaceCanvasState("ws-1", storage)).toEqual(
      createDefaultWorkspaceCanvasState(),
    );
    expect(storage.getItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY)).toBeNull();
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

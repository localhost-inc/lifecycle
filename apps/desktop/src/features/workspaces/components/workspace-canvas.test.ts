import { describe, expect, test } from "bun:test";
import type { GitPullRequestSummary } from "@lifecycle/contracts";
import {
  getWorkspaceTabDragShiftDirection,
  getRightmostWorkspaceTabKey,
  getWorkspaceAdjacentTabKey,
  getWorkspaceTabClosePlan,
  getWorkspaceTabKeyAfterClose,
  getWorkspaceTabKeyByIndex,
  orderWorkspaceTerminals,
  reconcileHiddenTerminalTabKeys,
  reorderWorkspaceTabKeys,
  resolveWorkspaceVisibleTabs,
} from "@/features/workspaces/components/workspace-canvas-tabs";
import {
  changesDiffTabKey,
  createChangesDiffTab,
  createCommitDiffTab,
  createDefaultWorkspaceCanvasState,
  createFileViewerTab,
  createPullRequestTab,
  fileViewerTabKey,
  getWorkspacePaneTabState,
  listWorkspaceHiddenTerminalTabKeys,
  listWorkspaceDocuments,
  listWorkspaceTabViewStateByKey,
  pullRequestTabKey,
  terminalTabKey,
  type WorkspaceCanvasDocument,
  type WorkspaceCanvasState,
  type WorkspaceCanvasTabViewState,
} from "@/features/workspaces/state/workspace-canvas-state";
import {
  readWorkspaceTabHotkeyAction,
  resolveWorkspaceCloseShortcutTarget,
  shouldTreatWindowCloseAsTabClose,
} from "@/features/workspaces/components/workspace-canvas-shortcuts";
import { workspaceCanvasReducer } from "@/features/workspaces/components/workspace-canvas-reducer";

const CHANGES_DIFF_TAB_KEY = changesDiffTabKey();

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
    "closedTabStack" | "documentsByKey" | "paneTabStateById" | "rootPane" | "tabStateByKey"
  > & {
    closedTabStack?: WorkspaceCanvasState["closedTabStack"];
    documents?: WorkspaceCanvasDocument[];
    hiddenTerminalTabKeys?: string[];
    rootPane?: TestWorkspacePaneNode;
    viewStateByTabKey?: Record<string, WorkspaceCanvasTabViewState>;
  },
): WorkspaceCanvasState {
  const {
    closedTabStack = [],
    documents = [],
    hiddenTerminalTabKeys = [],
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
    closedTabStack,
    documentsByKey: indexDocuments(documents),
    paneTabStateById: paneTreeState.paneTabStateById,
    rootPane: paneTreeState.rootPane,
    tabStateByKey: Object.fromEntries([
      ...hiddenTerminalTabKeys.map((key) => [key, { hidden: true }] as const),
      ...Object.entries(viewStateByTabKey).map(([key, viewState]) => [
        key,
        {
          ...(hiddenTerminalTabKeys.includes(key) ? { hidden: true } : {}),
          viewState,
        },
      ]),
    ]),
  };
}

function withSinglePaneState(
  overrides: Partial<WorkspaceCanvasState> & {
    activeTabKey?: string | null;
    documents?: WorkspaceCanvasDocument[];
    hiddenTerminalTabKeys?: string[];
    tabOrderKeys?: string[];
    viewStateByTabKey?: Record<string, WorkspaceCanvasTabViewState>;
  } = {},
): WorkspaceCanvasState {
  const base = createDefaultWorkspaceCanvasState();
  const baseRootPane = base.rootPane.kind === "leaf" ? base.rootPane : null;
  const {
    activeTabKey = null,
    documents = [],
    hiddenTerminalTabKeys = [],
    tabOrderKeys = [],
    viewStateByTabKey = {},
    ...rest
  } = overrides;

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
      ...hiddenTerminalTabKeys.map((key) => [key, { hidden: true }] as const),
      ...Object.entries(viewStateByTabKey).map(([key, viewState]) => [
        key,
        {
          ...(hiddenTerminalTabKeys.includes(key) ? { hidden: true } : {}),
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

describe("workspace canvas reducer", () => {
  test("ignores select-tab requests for panes that do not exist in the layout tree", () => {
    const initialState = withSinglePaneState({
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("src/app.tsx")],
      tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
    });

    expect(
      workspaceCanvasReducer(initialState, {
        key: CHANGES_DIFF_TAB_KEY,
        kind: "select-tab",
        paneId: "pane-missing",
      }),
    ).toEqual(initialState);
  });

  test("ignores select-tab requests for tabs that are not assigned to the target pane", () => {
    const initialState = withWorkspaceState({
      activePaneId: "pane-left",
      documents: [createChangesDiffTab("src/app.tsx"), createFileViewerTab("README.md")],
      rootPane: {
        direction: "row",
        first: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-left",
          kind: "leaf",
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
        id: "split-root",
        kind: "split",
        ratio: 0.5,
        second: {
          activeTabKey: fileViewerTabKey("README.md"),
          id: "pane-right",
          kind: "leaf",
          tabOrderKeys: [fileViewerTabKey("README.md")],
        },
      },
    });

    expect(
      workspaceCanvasReducer(initialState, {
        key: CHANGES_DIFF_TAB_KEY,
        kind: "select-tab",
        paneId: "pane-right",
      }),
    ).toEqual(initialState);
  });

  test("reuses the changes tab and updates focusPath on repeated opens", () => {
    const changesTab = createChangesDiffTab("src/app.tsx");

    expect(
      workspaceCanvasReducer(
        withSinglePaneState({
          activeTabKey: changesTab.key,
          documents: [changesTab],
          tabOrderKeys: [changesTab.key],
        }),
        {
          request: {
            id: "req-2",
            focusPath: "README.md",
            kind: "changes-diff",
          },
          kind: "open-document",
        },
      ),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("README.md")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
  });

  test("opens a single changes tab when requested from the git panel", () => {
    expect(
      workspaceCanvasReducer(createDefaultWorkspaceCanvasState(), {
        request: {
          id: "req-1",
          focusPath: "src/app.tsx",
          kind: "changes-diff",
        },
        kind: "open-document",
      }),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.tsx")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
  });

  test("splits the active pane into a new empty pane", () => {
    const initialState = withSinglePaneState({
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("src/app.tsx")],
      tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
    });

    expect(
      workspaceCanvasReducer(initialState, {
        direction: "row",
        kind: "split-pane",
        newPaneId: "pane-2",
        paneId: "pane-root",
        placement: "after",
        splitId: "split-1",
      }),
    ).toEqual(
      withWorkspaceState({
        activePaneId: "pane-2",
        documents: [createChangesDiffTab("src/app.tsx")],
        hiddenTerminalTabKeys: [],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.5,
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

  test("can split a pane before the existing pane for left-or-top drop targets", () => {
    const initialState = withSinglePaneState({
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("src/app.tsx")],
      tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
    });

    expect(
      workspaceCanvasReducer(initialState, {
        direction: "row",
        kind: "split-pane",
        newPaneId: "pane-left",
        paneId: "pane-root",
        placement: "before",
        splitId: "split-left",
      }),
    ).toEqual(
      withWorkspaceState({
        activePaneId: "pane-left",
        documents: [createChangesDiffTab("src/app.tsx")],
        hiddenTerminalTabKeys: [],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: null,
            id: "pane-left",
            kind: "leaf",
            tabOrderKeys: [],
          },
          id: "split-left",
          kind: "split",
          ratio: 0.5,
          second: {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
        },
        viewStateByTabKey: {},
      }),
    );
  });

  test("updates only the targeted split ratio", () => {
    const splitState = withWorkspaceState({
      activePaneId: "pane-3",
      documents: [createChangesDiffTab("src/app.tsx"), createFileViewerTab("README.md")],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.35,
        second: {
          direction: "column" as const,
          first: {
            activeTabKey: null,
            id: "pane-2",
            kind: "leaf" as const,
            tabOrderKeys: [],
          },
          id: "split-2",
          kind: "split" as const,
          ratio: 0.5,
          second: {
            activeTabKey: fileViewerTabKey("README.md"),
            id: "pane-3",
            kind: "leaf" as const,
            tabOrderKeys: [fileViewerTabKey("README.md")],
          },
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        kind: "set-split-ratio",
        ratio: 0.72,
        splitId: "split-2",
      }),
    ).toEqual(
      withWorkspaceState({
        activePaneId: "pane-3",
        documents: [createChangesDiffTab("src/app.tsx"), createFileViewerTab("README.md")],
        hiddenTerminalTabKeys: [],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.35,
          second: {
            direction: "column",
            first: {
              activeTabKey: null,
              id: "pane-2",
              kind: "leaf",
              tabOrderKeys: [],
            },
            id: "split-2",
            kind: "split",
            ratio: 0.72,
            second: {
              activeTabKey: fileViewerTabKey("README.md"),
              id: "pane-3",
              kind: "leaf",
              tabOrderKeys: [fileViewerTabKey("README.md")],
            },
          },
        },
        viewStateByTabKey: {},
      }),
    );
  });

  test("ignores explicit close-pane actions when the pane still owns tabs", () => {
    const splitState = withWorkspaceState({
      activePaneId: "pane-2",
      documents: [createChangesDiffTab("src/app.tsx")],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: null,
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [],
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        kind: "close-pane",
        paneId: "pane-root",
      }),
    ).toEqual(splitState);
  });

  test("close-pane collapses empty panes", () => {
    const splitState = withWorkspaceState({
      activePaneId: "pane-2",
      documents: [createChangesDiffTab("src/app.tsx")],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: null,
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [],
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        kind: "close-pane",
        paneId: "pane-2",
      }),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.tsx")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
  });

  test("collapse-pane removes a visibly empty pane even when stale tab order remains", () => {
    const splitState = withWorkspaceState({
      activePaneId: "pane-2",
      documents: [createChangesDiffTab("src/app.tsx")],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: null,
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [terminalTabKey("stale")],
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        kind: "collapse-pane",
        paneId: "pane-2",
      }),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: CHANGES_DIFF_TAB_KEY,
        documents: [createChangesDiffTab("src/app.tsx")],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
      }),
    );
  });

  test("closing the last document tab removes the empty pane when sibling panes exist", () => {
    const fileTab = createFileViewerTab("README.md");
    const splitState = withWorkspaceState({
      activePaneId: "pane-2",
      documents: [fileTab],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: null,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: fileTab.key,
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [fileTab.key],
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        key: fileTab.key,
        kind: "close-document",
      }),
    ).toEqual({
      ...createDefaultWorkspaceCanvasState(),
      closedTabStack: [{ document: fileTab, kind: "document", viewState: null }],
    });
  });

  test("moves a tab into another pane and activates the target pane", () => {
    const pullRequest = createPullRequestTab(createPullRequestSummary());
    const splitState = withWorkspaceState({
      activePaneId: "pane-root",
      documents: [
        createChangesDiffTab("src/app.tsx"),
        pullRequest,
        createFileViewerTab("README.md"),
      ],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: pullRequest.key,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY, pullRequest.key],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: fileViewerTabKey("README.md"),
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [fileViewerTabKey("README.md")],
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        emptySourcePanePolicy: "close",
        key: pullRequest.key,
        kind: "move-tab-to-pane",
        sourcePaneId: "pane-root",
        targetPaneId: "pane-2",
      }),
    ).toEqual(
      withWorkspaceState({
        activePaneId: "pane-2",
        documents: [
          createChangesDiffTab("src/app.tsx"),
          pullRequest,
          createFileViewerTab("README.md"),
        ],
        hiddenTerminalTabKeys: [],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.5,
          second: {
            activeTabKey: pullRequest.key,
            id: "pane-2",
            kind: "leaf",
            tabOrderKeys: [fileViewerTabKey("README.md"), pullRequest.key],
          },
        },
        viewStateByTabKey: {},
      }),
    );
  });

  test("closes the source pane when moving its last tab into another existing pane", () => {
    const fileTab = createFileViewerTab("README.md");
    const splitState = withWorkspaceState({
      activePaneId: "pane-root",
      documents: [fileTab],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: fileTab.key,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [fileTab.key],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: null,
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [],
        },
      },
      viewStateByTabKey: {},
    });

    const result = workspaceCanvasReducer(splitState, {
      emptySourcePanePolicy: "close",
      key: fileTab.key,
      kind: "move-tab-to-pane",
      sourcePaneId: "pane-root",
      targetPaneId: "pane-2",
    });

    expect(result.activePaneId).toBe("pane-2");
    expect(listWorkspaceHiddenTerminalTabKeys(result.tabStateByKey)).toEqual([]);
    expect(listWorkspaceTabViewStateByKey(result.tabStateByKey)).toEqual({});
    expect(result.rootPane).toEqual({
      id: "pane-2",
      kind: "leaf",
    });
    expect(getWorkspacePaneTabState(result.paneTabStateById, "pane-2")).toEqual({
      activeTabKey: fileTab.key,
      tabOrderKeys: [fileTab.key],
    });
    expect(listWorkspaceDocuments(result.documentsByKey)).toEqual([fileTab]);
  });

  test("inserts a moved tab before an existing target tab in the destination pane", () => {
    const pullRequest = createPullRequestTab(createPullRequestSummary());
    const fileTab = createFileViewerTab("README.md");
    const changesTab = createChangesDiffTab("src/app.tsx");
    const splitState = withWorkspaceState({
      activePaneId: "pane-root",
      documents: [pullRequest, fileTab, changesTab],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: pullRequest.key,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [pullRequest.key],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: changesTab.key,
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [fileTab.key, changesTab.key],
        },
      },
      viewStateByTabKey: {},
    });

    const result = workspaceCanvasReducer(splitState, {
      emptySourcePanePolicy: "close",
      key: pullRequest.key,
      kind: "move-tab-to-pane",
      placement: "before",
      sourcePaneId: "pane-root",
      targetKey: changesTab.key,
      targetPaneId: "pane-2",
    });

    expect(result.activePaneId).toBe("pane-2");
    expect(listWorkspaceHiddenTerminalTabKeys(result.tabStateByKey)).toEqual([]);
    expect(listWorkspaceTabViewStateByKey(result.tabStateByKey)).toEqual({});
    expect(result.rootPane).toEqual({
      id: "pane-2",
      kind: "leaf",
    });
    expect(getWorkspacePaneTabState(result.paneTabStateById, "pane-2")).toEqual({
      activeTabKey: pullRequest.key,
      tabOrderKeys: [fileTab.key, pullRequest.key, changesTab.key],
    });
    expect(listWorkspaceDocuments(result.documentsByKey)).toEqual([
      pullRequest,
      fileTab,
      changesTab,
    ]);
  });

  test("creates a split pane that owns only the dragged tab", () => {
    const changesTab = createChangesDiffTab("src/app.tsx");
    const fileTab = createFileViewerTab("README.md");
    const splitState = workspaceCanvasReducer(
      withSinglePaneState({
        activeTabKey: fileTab.key,
        documents: [changesTab, fileTab],
        tabOrderKeys: [changesTab.key, fileTab.key],
      }),
      {
        direction: "column",
        kind: "split-pane",
        newPaneId: "pane-split",
        paneId: "pane-root",
        placement: "after",
        splitId: "split-surface",
      },
    );

    expect(
      workspaceCanvasReducer(splitState, {
        emptySourcePanePolicy: "close",
        key: fileTab.key,
        kind: "move-tab-to-pane",
        sourcePaneId: "pane-root",
        targetPaneId: "pane-split",
      }),
    ).toEqual(
      withWorkspaceState({
        activePaneId: "pane-split",
        documents: [changesTab, fileTab],
        hiddenTerminalTabKeys: [],
        rootPane: {
          direction: "column",
          first: {
            activeTabKey: changesTab.key,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [changesTab.key],
          },
          id: "split-surface",
          kind: "split",
          ratio: 0.5,
          second: {
            activeTabKey: fileTab.key,
            id: "pane-split",
            kind: "leaf",
            tabOrderKeys: [fileTab.key],
          },
        },
        viewStateByTabKey: {},
      }),
    );
  });

  test("applies an explicit split ratio for drag-created panes", () => {
    expect(
      workspaceCanvasReducer(createDefaultWorkspaceCanvasState(), {
        direction: "row",
        kind: "split-pane",
        newPaneId: "pane-2",
        paneId: "pane-root",
        placement: "after",
        ratio: 0.58,
        splitId: "split-1",
      }),
    ).toEqual(
      withWorkspaceState({
        activePaneId: "pane-2",
        documents: [],
        hiddenTerminalTabKeys: [],
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
          ratio: 0.58,
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

  test("hides live tabs instead of removing terminal ownership from state", () => {
    expect(
      workspaceCanvasReducer(
        withSinglePaneState({
          activeTabKey: terminalTabKey("term-2"),
          documents: [createCommitDiffTab("abc12345")],
          tabOrderKeys: [
            terminalTabKey("term-1"),
            terminalTabKey("term-2"),
            "diff:commit:abc12345",
          ],
        }),
        {
          key: terminalTabKey("term-2"),
          kind: "hide-terminal-tab",
        },
      ),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: "diff:commit:abc12345",
        documents: [createCommitDiffTab("abc12345")],
        hiddenTerminalTabKeys: [terminalTabKey("term-2")],
        tabOrderKeys: [terminalTabKey("term-1"), "diff:commit:abc12345"],
      }),
    );
  });

  test("closing the last live tab removes the empty pane when sibling panes exist", () => {
    const splitState = withWorkspaceState({
      activePaneId: "pane-2",
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: null,
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: terminalTabKey("term-1"),
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [terminalTabKey("term-1")],
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        key: terminalTabKey("term-1"),
        kind: "hide-terminal-tab",
      }),
    ).toEqual(
      withSinglePaneState({
        hiddenTerminalTabKeys: [terminalTabKey("term-1")],
      }),
    );
  });

  test("restores hidden live tabs at the right edge when reopened", () => {
    expect(
      workspaceCanvasReducer(
        withSinglePaneState({
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          documents: [createChangesDiffTab("src/app.tsx")],
          hiddenTerminalTabKeys: [terminalTabKey("term-2")],
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        }),
        {
          key: terminalTabKey("term-2"),
          paneId: "pane-root",
          select: true,
          kind: "show-terminal-tab",
        },
      ),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: terminalTabKey("term-2"),
        documents: [createChangesDiffTab("src/app.tsx")],
        hiddenTerminalTabKeys: [],
        tabOrderKeys: [CHANGES_DIFF_TAB_KEY, terminalTabKey("term-2")],
      }),
    );
  });

  test("moves an auto-assigned live tab into the explicitly requested pane", () => {
    const splitState = withWorkspaceState({
      activePaneId: "pane-root",
      documents: [createChangesDiffTab("src/app.tsx")],
      hiddenTerminalTabKeys: [],
      rootPane: {
        direction: "row" as const,
        first: {
          activeTabKey: terminalTabKey("term-1"),
          id: "pane-root",
          kind: "leaf" as const,
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY, terminalTabKey("term-1")],
        },
        id: "split-1",
        kind: "split" as const,
        ratio: 0.5,
        second: {
          activeTabKey: null,
          id: "pane-2",
          kind: "leaf" as const,
          tabOrderKeys: [],
        },
      },
      viewStateByTabKey: {},
    });

    expect(
      workspaceCanvasReducer(splitState, {
        key: terminalTabKey("term-1"),
        kind: "show-terminal-tab",
        paneId: "pane-2",
        select: true,
      }),
    ).toEqual(
      withWorkspaceState({
        activePaneId: "pane-2",
        documents: [createChangesDiffTab("src/app.tsx")],
        hiddenTerminalTabKeys: [],
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: CHANGES_DIFF_TAB_KEY,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.5,
          second: {
            activeTabKey: terminalTabKey("term-1"),
            id: "pane-2",
            kind: "leaf",
            tabOrderKeys: [terminalTabKey("term-1")],
          },
        },
        viewStateByTabKey: {},
      }),
    );
  });

  test("stores per-tab view state for reopened document tabs", () => {
    expect(
      workspaceCanvasReducer(
        withSinglePaneState({
          activeTabKey: fileViewerTabKey("README.md"),
          documents: [createFileViewerTab("README.md")],
          tabOrderKeys: [fileViewerTabKey("README.md")],
        }),
        {
          key: fileViewerTabKey("README.md"),
          kind: "set-tab-view-state",
          viewState: {
            scrollTop: 144,
          },
        },
      ),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [createFileViewerTab("README.md")],
        tabOrderKeys: [fileViewerTabKey("README.md")],
        viewStateByTabKey: {
          [fileViewerTabKey("README.md")]: {
            scrollTop: 144,
          },
        },
      }),
    );
  });

  test("opens pull request documents from the git panel", () => {
    const pullRequestSummary = createPullRequestSummary();
    const pullRequest = createPullRequestTab(pullRequestSummary);

    expect(
      workspaceCanvasReducer(createDefaultWorkspaceCanvasState(), {
        request: {
          id: "pr-1",
          pullRequest: pullRequestSummary,
          kind: "pull-request",
        },
        kind: "open-document",
      }),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: pullRequestTabKey(42),
        documents: [pullRequest],
        tabOrderKeys: [pullRequestTabKey(42)],
      }),
    );
  });

  test("opens file viewer documents with path-based reuse", () => {
    const firstState = workspaceCanvasReducer(createDefaultWorkspaceCanvasState(), {
      request: {
        filePath: "./docs/../README.md",
        id: "file-1",
        kind: "file-viewer",
      },
      kind: "open-document",
    });

    expect(firstState).toEqual(
      withSinglePaneState({
        activeTabKey: fileViewerTabKey("README.md"),
        documents: [createFileViewerTab("README.md")],
        tabOrderKeys: [fileViewerTabKey("README.md")],
      }),
    );

    expect(
      workspaceCanvasReducer(firstState, {
        request: {
          filePath: "README.md",
          id: "file-2",
          kind: "file-viewer",
        },
        kind: "open-document",
      }),
    ).toEqual(firstState);
  });

  test("updates an existing pull request document when reopened", () => {
    const firstPullRequestSummary = createPullRequestSummary({
      isDraft: true,
      mergeStateStatus: "BLOCKED",
      mergeable: "unknown",
      reviewDecision: null,
    });
    const firstPullRequest = createPullRequestTab(firstPullRequestSummary);
    const updatedPullRequestSummary = createPullRequestSummary({
      checks: [
        {
          detailsUrl: "https://github.com/example/repo/actions/runs/42",
          name: "CI",
          status: "success",
          workflowName: "ci",
        },
      ],
      isDraft: false,
      mergeStateStatus: "CLEAN",
      mergeable: "mergeable",
      reviewDecision: "approved",
      title: "feat: add pull request surface polish",
    });
    const updatedPullRequest = createPullRequestTab(updatedPullRequestSummary);

    expect(
      workspaceCanvasReducer(
        withSinglePaneState({
          activeTabKey: firstPullRequest.key,
          documents: [firstPullRequest],
          tabOrderKeys: [firstPullRequest.key],
        }),
        {
          request: {
            id: "pr-2",
            pullRequest: updatedPullRequestSummary,
            kind: "pull-request",
          },
          kind: "open-document",
        },
      ),
    ).toEqual(
      withSinglePaneState({
        activeTabKey: firstPullRequest.key,
        documents: [updatedPullRequest],
        tabOrderKeys: [firstPullRequest.key],
      }),
    );
  });
});

describe("canvas tab helpers", () => {
  test("keeps workspace terminal tabs oldest-to-newest so new tabs append on the right", () => {
    expect(
      orderWorkspaceTerminals([
        {
          created_by: null,
          ended_at: null,
          exit_code: null,
          failure_reason: null,
          harness_provider: null,
          harness_session_id: null,
          id: "terminal_2",
          label: "Terminal 2",
          last_active_at: "2026-03-08T10:01:00.000Z",
          launch_type: "shell",
          started_at: "2026-03-08T10:01:00.000Z",
          status: "active",
          workspace_id: "workspace_1",
        },
        {
          created_by: null,
          ended_at: null,
          exit_code: null,
          failure_reason: null,
          harness_provider: null,
          harness_session_id: null,
          id: "terminal_1",
          label: "Terminal 1",
          last_active_at: "2026-03-08T10:00:00.000Z",
          launch_type: "shell",
          started_at: "2026-03-08T10:00:00.000Z",
          status: "active",
          workspace_id: "workspace_1",
        },
      ]).map((terminal) => terminal.id),
    ).toEqual(["terminal_1", "terminal_2"]);
  });

  test("resolves mixed visible tabs using persisted order and hidden live tabs", () => {
    expect(
      resolveWorkspaceVisibleTabs(
        [
          {
            harnessProvider: null,
            key: terminalTabKey("term-1"),
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
          {
            harnessProvider: null,
            key: terminalTabKey("term-2"),
            kind: "terminal",
            label: "Terminal 2",
            launchType: "shell",
            responseReady: true,
            status: "active",
            terminalId: "term-2",
          },
        ],
        indexDocuments([createChangesDiffTab("src/app.tsx"), createFileViewerTab("README.md")]),
        [
          fileViewerTabKey("README.md"),
          terminalTabKey("term-2"),
          CHANGES_DIFF_TAB_KEY,
          terminalTabKey("term-1"),
        ],
        [terminalTabKey("term-2")],
      ).map((tab) => tab.key),
    ).toEqual([fileViewerTabKey("README.md"), CHANGES_DIFF_TAB_KEY, terminalTabKey("term-1")]);
  });

  test("resolves only the tabs assigned to each pane instead of mirroring global tabs", () => {
    const terminalTabs = [
      {
        harnessProvider: null,
        key: terminalTabKey("term-1"),
        kind: "terminal" as const,
        label: "Terminal 1",
        launchType: "shell" as const,
        responseReady: false,
        status: "active" as const,
        terminalId: "term-1",
      },
      {
        harnessProvider: null,
        key: terminalTabKey("term-2"),
        kind: "terminal" as const,
        label: "Terminal 2",
        launchType: "shell" as const,
        responseReady: false,
        status: "active" as const,
        terminalId: "term-2",
      },
    ];
    const documents = indexDocuments([
      createChangesDiffTab("src/app.tsx"),
      createFileViewerTab("README.md"),
    ]);

    expect(
      resolveWorkspaceVisibleTabs(
        terminalTabs,
        documents,
        [terminalTabKey("term-1"), fileViewerTabKey("README.md")],
        [],
      ).map((tab) => tab.key),
    ).toEqual([terminalTabKey("term-1"), fileViewerTabKey("README.md")]);
    expect(
      resolveWorkspaceVisibleTabs(
        terminalTabs,
        documents,
        [CHANGES_DIFF_TAB_KEY, terminalTabKey("term-2")],
        [],
      ).map((tab) => tab.key),
    ).toEqual([CHANGES_DIFF_TAB_KEY, terminalTabKey("term-2")]);
  });

  test("returns the key for the rightmost tab", () => {
    expect(
      getRightmostWorkspaceTabKey([
        { key: terminalTabKey("1") },
        { key: terminalTabKey("2") },
        { key: "commit:abc123" },
      ]),
    ).toBe("commit:abc123");
  });

  test("selects the tab to the right before falling back to the left when closing", () => {
    expect(
      getWorkspaceTabKeyAfterClose(
        [terminalTabKey("1"), CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md")],
        CHANGES_DIFF_TAB_KEY,
      ),
    ).toBe(fileViewerTabKey("README.md"));
    expect(
      getWorkspaceTabKeyAfterClose(
        [terminalTabKey("1"), fileViewerTabKey("README.md")],
        fileViewerTabKey("README.md"),
      ),
    ).toBe(terminalTabKey("1"));
  });

  test("returns only the adjacent visible tab when planning a close", () => {
    expect(getWorkspaceTabClosePlan([terminalTabKey("1")], terminalTabKey("1"))).toEqual({
      nextActiveKey: null,
    });

    expect(
      getWorkspaceTabClosePlan(
        [terminalTabKey("1"), fileViewerTabKey("README.md")],
        terminalTabKey("1"),
      ),
    ).toEqual({
      nextActiveKey: fileViewerTabKey("README.md"),
    });
  });

  test("treats a fresh shortcut-driven window close as a tab close", () => {
    expect(shouldTreatWindowCloseAsTabClose(1_000, 1_200)).toBeTrue();
    expect(shouldTreatWindowCloseAsTabClose(1_000, 1_251)).toBeFalse();
    expect(shouldTreatWindowCloseAsTabClose(0, 1_200)).toBeFalse();
  });

  test("closes the active tab first, then the pane, then the project tab", () => {
    // With tabs still open, return null to let the handler close the active tab
    expect(resolveWorkspaceCloseShortcutTarget(2, 3)).toBeNull();
    expect(resolveWorkspaceCloseShortcutTarget(2, 1)).toBeNull();
    expect(resolveWorkspaceCloseShortcutTarget(1, 2)).toBeNull();
    // With no tabs in the active pane, close the pane when multiple panes exist
    expect(resolveWorkspaceCloseShortcutTarget(2, 0)).toBe("close-pane");
    expect(resolveWorkspaceCloseShortcutTarget(2)).toBe("close-pane");
    // With no tabs and only one pane, close the project tab
    expect(resolveWorkspaceCloseShortcutTarget(1, 0)).toBe("close-project-tab");
    expect(resolveWorkspaceCloseShortcutTarget(1)).toBe("close-project-tab");
    expect(resolveWorkspaceCloseShortcutTarget(0)).toBeNull();
  });

  test("preserves hidden live tabs until terminal queries finish loading", () => {
    expect(
      reconcileHiddenTerminalTabKeys([terminalTabKey("1"), terminalTabKey("2")], [], false),
    ).toEqual([
      terminalTabKey("1"),
      terminalTabKey("2"),
    ]);

    expect(
      reconcileHiddenTerminalTabKeys(
        [terminalTabKey("1"), terminalTabKey("2")],
        [terminalTabKey("2"), terminalTabKey("3")],
        true,
      ),
    ).toEqual([terminalTabKey("2")]);
  });

  test("moves to adjacent tabs without wrapping", () => {
    const keys = [terminalTabKey("1"), CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md")];

    expect(getWorkspaceAdjacentTabKey(keys, CHANGES_DIFF_TAB_KEY, "next")).toBe(
      fileViewerTabKey("README.md"),
    );
    expect(getWorkspaceAdjacentTabKey(keys, CHANGES_DIFF_TAB_KEY, "previous")).toBe(
      terminalTabKey("1"),
    );
    expect(getWorkspaceAdjacentTabKey(keys, fileViewerTabKey("README.md"), "next")).toBeNull();
  });

  test("maps numeric shortcuts to visible tab positions", () => {
    const keys = [
      terminalTabKey("1"),
      terminalTabKey("2"),
      CHANGES_DIFF_TAB_KEY,
      fileViewerTabKey("README.md"),
    ];

    expect(getWorkspaceTabKeyByIndex(keys, 1)).toBe(terminalTabKey("1"));
    expect(getWorkspaceTabKeyByIndex(keys, 3)).toBe(CHANGES_DIFF_TAB_KEY);
    expect(getWorkspaceTabKeyByIndex(keys, 9)).toBe(fileViewerTabKey("README.md"));
  });

  test("reorders visible tab keys based on drag placement", () => {
    expect(
      reorderWorkspaceTabKeys(
        [terminalTabKey("1"), CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md")],
        terminalTabKey("1"),
        fileViewerTabKey("README.md"),
        "after",
      ),
    ).toEqual([CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md"), terminalTabKey("1")]);
  });

  test("shifts intervening tabs left when previewing a drag to the right", () => {
    expect(
      getWorkspaceTabDragShiftDirection(
        [terminalTabKey("1"), CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md")],
        terminalTabKey("1"),
        fileViewerTabKey("README.md"),
        "after",
        CHANGES_DIFF_TAB_KEY,
      ),
    ).toBe(-1);

    expect(
      getWorkspaceTabDragShiftDirection(
        [terminalTabKey("1"), CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md")],
        terminalTabKey("1"),
        fileViewerTabKey("README.md"),
        "after",
        fileViewerTabKey("README.md"),
      ),
    ).toBe(-1);
  });

  test("shifts intervening tabs right when previewing a drag to the left", () => {
    expect(
      getWorkspaceTabDragShiftDirection(
        [terminalTabKey("1"), CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md")],
        fileViewerTabKey("README.md"),
        terminalTabKey("1"),
        "before",
        terminalTabKey("1"),
      ),
    ).toBe(1);

    expect(
      getWorkspaceTabDragShiftDirection(
        [terminalTabKey("1"), CHANGES_DIFF_TAB_KEY, fileViewerTabKey("README.md")],
        fileViewerTabKey("README.md"),
        terminalTabKey("1"),
        "before",
        CHANGES_DIFF_TAB_KEY,
      ),
    ).toBe(1);
  });
});

describe("readWorkspaceTabHotkeyAction", () => {
  test("reads mac new-tab and close-active-tab with Cmd modifier", () => {
    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "KeyT",
          ctrlKey: false,
          key: "t",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toEqual({ kind: "new-tab" });

    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "KeyW",
          ctrlKey: false,
          key: "w",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toEqual({ kind: "close-active-tab" });
  });

  test("Cmd+Shift+[ no longer matches tab shortcuts on mac (now workspace nav)", () => {
    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "BracketLeft",
          ctrlKey: false,
          key: "[",
          metaKey: true,
          shiftKey: true,
        },
        true,
      ),
    ).toBeNull();
  });

  test("Ctrl+Tab cycles tabs on mac and non-mac", () => {
    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "Tab",
          ctrlKey: true,
          key: "Tab",
          metaKey: false,
          shiftKey: false,
        },
        true,
      ),
    ).toEqual({ kind: "next-tab" });

    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "Tab",
          ctrlKey: true,
          key: "Tab",
          metaKey: false,
          shiftKey: true,
        },
        true,
      ),
    ).toEqual({ kind: "previous-tab" });

    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "Tab",
          ctrlKey: true,
          key: "Tab",
          metaKey: false,
          shiftKey: true,
        },
        false,
      ),
    ).toEqual({ kind: "previous-tab" });
  });

  test("reads standard non-mac shortcuts", () => {
    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "KeyW",
          ctrlKey: true,
          key: "w",
          metaKey: false,
          shiftKey: false,
        },
        false,
      ),
    ).toEqual({ kind: "close-active-tab" });
  });

  test("Cmd+1..9 no longer matches tab shortcuts (now project selection)", () => {
    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "Digit9",
          ctrlKey: false,
          key: "9",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toBeNull();

    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "Digit9",
          ctrlKey: true,
          key: "9",
          metaKey: false,
          shiftKey: false,
        },
        false,
      ),
    ).toBeNull();
  });
});

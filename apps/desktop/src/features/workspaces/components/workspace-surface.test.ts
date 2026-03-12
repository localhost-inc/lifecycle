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
  readWorkspaceTabHotkeyAction,
  reconcileHiddenRuntimeTabKeys,
  reorderWorkspaceTabKeys,
  resolveWorkspaceVisibleTabs,
  shouldTreatWindowCloseAsTabClose,
  workspaceSurfaceReducer,
} from "./workspace-surface-logic";
import {
  changesDiffTabKey,
  createChangesDiffTab,
  createCommitDiffTab,
  createDefaultWorkspaceSurfaceState,
  createFileViewerTab,
  createLauncherTab,
  createPullRequestTab,
  fileViewerTabKey,
  pullRequestTabKey,
} from "../state/workspace-surface-state";

const CHANGES_DIFF_TAB_KEY = changesDiffTabKey();

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

describe("workspaceSurfaceReducer", () => {
  test("reuses the changes tab and updates focusPath on repeated opens", () => {
    const changesTab = createChangesDiffTab("src/app.tsx");

    expect(
      workspaceSurfaceReducer(
        {
          ...createDefaultWorkspaceSurfaceState(),
          activeTabKey: changesTab.key,
          documents: [changesTab],
        },
        {
          request: {
            id: "req-2",
            focusPath: "README.md",
            kind: "changes-diff",
          },
          kind: "open-document",
        },
      ),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("README.md")],
      tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
    });
  });

  test("opens a single changes tab when requested from the git panel", () => {
    expect(
      workspaceSurfaceReducer(createDefaultWorkspaceSurfaceState(), {
        request: {
          id: "req-1",
          focusPath: "src/app.tsx",
          kind: "changes-diff",
        },
        kind: "open-document",
      }),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: CHANGES_DIFF_TAB_KEY,
      documents: [createChangesDiffTab("src/app.tsx")],
      tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
    });
  });

  test("opens launcher tabs as workspace-owned documents", () => {
    const state = workspaceSurfaceReducer(createDefaultWorkspaceSurfaceState(), {
      launcherId: "launcher-1",
      kind: "open-launcher",
    });

    expect(state.activeTabKey).toBe("launcher:launcher-1");
    expect(state.documents).toEqual([createLauncherTab("launcher-1")]);
    expect(state.tabOrderKeys).toEqual(["launcher:launcher-1"]);
  });

  test("replaces a launcher tab with a runtime tab key when opening from the launcher", () => {
    const launcher = createLauncherTab("launcher-1");

    expect(
      workspaceSurfaceReducer(
        {
          ...createDefaultWorkspaceSurfaceState(),
          activeTabKey: launcher.key,
          documents: [launcher],
          hiddenRuntimeTabKeys: ["terminal:term-1"],
          tabOrderKeys: [launcher.key],
        },
        {
          launcherKey: launcher.key,
          tabKey: "terminal:term-1",
          kind: "replace-launcher-with-tab",
        },
      ),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: "terminal:term-1",
      documents: [],
      hiddenRuntimeTabKeys: [],
      tabOrderKeys: ["terminal:term-1"],
    });
  });

  test("hides runtime tabs instead of removing terminal ownership from state", () => {
    expect(
      workspaceSurfaceReducer(
        {
          ...createDefaultWorkspaceSurfaceState(),
          activeTabKey: "terminal:term-2",
          documents: [createCommitDiffTab("abc12345")],
          tabOrderKeys: ["terminal:term-1", "terminal:term-2", "diff:commit:abc12345"],
        },
        {
          key: "terminal:term-2",
          nextActiveKey: "diff:commit:abc12345",
          kind: "hide-runtime-tab",
        },
      ),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: "diff:commit:abc12345",
      documents: [createCommitDiffTab("abc12345")],
      hiddenRuntimeTabKeys: ["terminal:term-2"],
      tabOrderKeys: ["terminal:term-1", "diff:commit:abc12345"],
    });
  });

  test("restores hidden runtime tabs at the right edge when reopened", () => {
    expect(
      workspaceSurfaceReducer(
        {
          ...createDefaultWorkspaceSurfaceState(),
          activeTabKey: CHANGES_DIFF_TAB_KEY,
          documents: [createChangesDiffTab("src/app.tsx")],
          hiddenRuntimeTabKeys: ["terminal:term-2"],
          tabOrderKeys: [CHANGES_DIFF_TAB_KEY],
        },
        {
          key: "terminal:term-2",
          select: true,
          kind: "show-runtime-tab",
        },
      ),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: "terminal:term-2",
      documents: [createChangesDiffTab("src/app.tsx")],
      hiddenRuntimeTabKeys: [],
      tabOrderKeys: [CHANGES_DIFF_TAB_KEY, "terminal:term-2"],
    });
  });

  test("stores per-tab view state for reopened document tabs", () => {
    expect(
      workspaceSurfaceReducer(
        {
          ...createDefaultWorkspaceSurfaceState(),
          activeTabKey: fileViewerTabKey("README.md"),
          documents: [createFileViewerTab("README.md")],
        },
        {
          key: fileViewerTabKey("README.md"),
          kind: "set-tab-view-state",
          viewState: {
            scrollTop: 144,
          },
        },
      ),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: fileViewerTabKey("README.md"),
      documents: [createFileViewerTab("README.md")],
      viewStateByTabKey: {
        [fileViewerTabKey("README.md")]: {
          scrollTop: 144,
        },
      },
    });
  });

  test("opens pull request documents from the git panel", () => {
    const pullRequestSummary = createPullRequestSummary();
    const pullRequest = createPullRequestTab(pullRequestSummary);

    expect(
      workspaceSurfaceReducer(createDefaultWorkspaceSurfaceState(), {
        request: {
          id: "pr-1",
          pullRequest: pullRequestSummary,
          kind: "pull-request",
        },
        kind: "open-document",
      }),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: pullRequestTabKey(42),
      documents: [pullRequest],
      tabOrderKeys: [pullRequestTabKey(42)],
    });
  });

  test("opens file viewer documents with path-based reuse", () => {
    const firstState = workspaceSurfaceReducer(createDefaultWorkspaceSurfaceState(), {
      request: {
        filePath: "./docs/../README.md",
        id: "file-1",
        kind: "file-viewer",
      },
      kind: "open-document",
    });

    expect(firstState).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: fileViewerTabKey("README.md"),
      documents: [createFileViewerTab("README.md")],
      tabOrderKeys: [fileViewerTabKey("README.md")],
    });

    expect(
      workspaceSurfaceReducer(firstState, {
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
      workspaceSurfaceReducer(
        {
          ...createDefaultWorkspaceSurfaceState(),
          activeTabKey: firstPullRequest.key,
          documents: [firstPullRequest],
          tabOrderKeys: [firstPullRequest.key],
        },
        {
          request: {
            id: "pr-2",
            pullRequest: updatedPullRequestSummary,
            kind: "pull-request",
          },
          kind: "open-document",
        },
      ),
    ).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: firstPullRequest.key,
      documents: [updatedPullRequest],
      tabOrderKeys: [firstPullRequest.key],
    });
  });
});

describe("workspace tab helpers", () => {
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

  test("resolves mixed visible tabs using persisted order and hidden runtime tabs", () => {
    expect(
      resolveWorkspaceVisibleTabs(
        [
          {
            harnessProvider: null,
            key: "terminal:term-1",
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
          {
            harnessProvider: null,
            key: "terminal:term-2",
            kind: "terminal",
            label: "Terminal 2",
            launchType: "shell",
            responseReady: true,
            status: "active",
            terminalId: "term-2",
          },
        ],
        [createChangesDiffTab("src/app.tsx"), createLauncherTab("launcher-1")],
        ["launcher:launcher-1", "terminal:term-2", CHANGES_DIFF_TAB_KEY, "terminal:term-1"],
        ["terminal:term-2"],
      ).map((tab) => tab.key),
    ).toEqual(["launcher:launcher-1", CHANGES_DIFF_TAB_KEY, "terminal:term-1"]);
  });

  test("returns the key for the rightmost tab", () => {
    expect(
      getRightmostWorkspaceTabKey([
        { key: "terminal:1" },
        { key: "terminal:2" },
        { key: "commit:abc123" },
      ]),
    ).toBe("commit:abc123");
  });

  test("selects the tab to the right before falling back to the left when closing", () => {
    expect(
      getWorkspaceTabKeyAfterClose(
        ["terminal:1", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"],
        CHANGES_DIFF_TAB_KEY,
      ),
    ).toBe("launcher:launcher-1");
    expect(
      getWorkspaceTabKeyAfterClose(["terminal:1", "launcher:launcher-1"], "launcher:launcher-1"),
    ).toBe("terminal:1");
  });

  test("plans a launcher fallback when closing the final visible tab", () => {
    expect(getWorkspaceTabClosePlan(["terminal:1"], "terminal:1", "launcher:replacement")).toEqual({
      nextActiveKey: "launcher:replacement",
      openLauncher: true,
    });

    expect(
      getWorkspaceTabClosePlan(
        ["terminal:1", "launcher:launcher-1"],
        "terminal:1",
        "launcher:replacement",
      ),
    ).toEqual({
      nextActiveKey: "launcher:launcher-1",
      openLauncher: false,
    });
  });

  test("treats a fresh shortcut-driven window close as a tab close", () => {
    expect(shouldTreatWindowCloseAsTabClose(1_000, 1_200)).toBeTrue();
    expect(shouldTreatWindowCloseAsTabClose(1_000, 1_251)).toBeFalse();
    expect(shouldTreatWindowCloseAsTabClose(0, 1_200)).toBeFalse();
  });

  test("preserves hidden runtime tabs until terminal queries finish loading", () => {
    expect(reconcileHiddenRuntimeTabKeys(["terminal:1", "terminal:2"], [], false)).toEqual([
      "terminal:1",
      "terminal:2",
    ]);

    expect(
      reconcileHiddenRuntimeTabKeys(
        ["terminal:1", "terminal:2"],
        ["terminal:2", "terminal:3"],
        true,
      ),
    ).toEqual(["terminal:2"]);
  });

  test("moves to adjacent tabs without wrapping", () => {
    const keys = ["terminal:1", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"];

    expect(getWorkspaceAdjacentTabKey(keys, CHANGES_DIFF_TAB_KEY, "next")).toBe(
      "launcher:launcher-1",
    );
    expect(getWorkspaceAdjacentTabKey(keys, CHANGES_DIFF_TAB_KEY, "previous")).toBe("terminal:1");
    expect(getWorkspaceAdjacentTabKey(keys, "launcher:launcher-1", "next")).toBeNull();
  });

  test("maps numeric shortcuts to visible tab positions", () => {
    const keys = ["terminal:1", "terminal:2", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"];

    expect(getWorkspaceTabKeyByIndex(keys, 1)).toBe("terminal:1");
    expect(getWorkspaceTabKeyByIndex(keys, 3)).toBe(CHANGES_DIFF_TAB_KEY);
    expect(getWorkspaceTabKeyByIndex(keys, 9)).toBe("launcher:launcher-1");
  });

  test("reorders visible tab keys based on drag placement", () => {
    expect(
      reorderWorkspaceTabKeys(
        ["terminal:1", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"],
        "terminal:1",
        "launcher:launcher-1",
        "after",
      ),
    ).toEqual([CHANGES_DIFF_TAB_KEY, "launcher:launcher-1", "terminal:1"]);
  });

  test("shifts intervening tabs left when previewing a drag to the right", () => {
    expect(
      getWorkspaceTabDragShiftDirection(
        ["terminal:1", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"],
        "terminal:1",
        "launcher:launcher-1",
        "after",
        CHANGES_DIFF_TAB_KEY,
      ),
    ).toBe(-1);

    expect(
      getWorkspaceTabDragShiftDirection(
        ["terminal:1", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"],
        "terminal:1",
        "launcher:launcher-1",
        "after",
        "launcher:launcher-1",
      ),
    ).toBe(-1);
  });

  test("shifts intervening tabs right when previewing a drag to the left", () => {
    expect(
      getWorkspaceTabDragShiftDirection(
        ["terminal:1", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"],
        "launcher:launcher-1",
        "terminal:1",
        "before",
        "terminal:1",
      ),
    ).toBe(1);

    expect(
      getWorkspaceTabDragShiftDirection(
        ["terminal:1", CHANGES_DIFF_TAB_KEY, "launcher:launcher-1"],
        "launcher:launcher-1",
        "terminal:1",
        "before",
        CHANGES_DIFF_TAB_KEY,
      ),
    ).toBe(1);
  });
});

describe("readWorkspaceTabHotkeyAction", () => {
  test("reads standard mac tab shortcuts without stealing history bracket shortcuts", () => {
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
          code: "BracketLeft",
          ctrlKey: false,
          key: "[",
          metaKey: true,
          shiftKey: true,
        },
        true,
      ),
    ).toEqual({ kind: "previous-tab" });

    expect(
      readWorkspaceTabHotkeyAction(
        {
          altKey: false,
          code: "BracketLeft",
          ctrlKey: false,
          key: "[",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toBeNull();
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
    ).toEqual({ index: 9, kind: "select-tab-index" });

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
});

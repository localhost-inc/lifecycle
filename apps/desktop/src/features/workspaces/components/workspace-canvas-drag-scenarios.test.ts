import { describe, expect, test } from "bun:test";
import { inspectWorkspacePaneLayout } from "@/features/workspaces/lib/workspace-pane-layout";
import {
  createFileViewerTab,
  createDefaultWorkspaceCanvasState,
  getWorkspacePaneTabState,
  type WorkspaceCanvasDocument,
  type WorkspaceCanvasState,
} from "@/features/workspaces/state/workspace-canvas-state";
import {
  resolveWorkspacePaneDropStateFromGeometry,
  type WorkspacePaneDropGeometry,
  type WorkspacePaneResolvedDropState,
} from "@/features/workspaces/components/workspace-pane-drop-zones";
import { workspaceCanvasReducer } from "@/features/workspaces/components/workspace-canvas-reducer";

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

function indexDocuments(
  documents: readonly WorkspaceCanvasDocument[],
): WorkspaceCanvasState["documentsByKey"] {
  return Object.fromEntries(documents.map((document) => [document.key, document]));
}

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

function withWorkspaceState({
  activePaneId,
  documents = [],
  rootPane,
}: {
  activePaneId?: string;
  documents?: WorkspaceCanvasDocument[];
  rootPane: TestWorkspacePaneNode;
}): WorkspaceCanvasState {
  const base = createDefaultWorkspaceCanvasState();
  const paneTreeState = buildPaneTreeState(rootPane);

  return {
    ...base,
    activePaneId:
      activePaneId ??
      (rootPane.kind === "leaf"
        ? rootPane.id
        : inspectWorkspacePaneLayout(paneTreeState.rootPane).firstPane.id),
    documentsByKey: indexDocuments(documents),
    paneTabStateById: paneTreeState.paneTabStateById,
    rootPane: paneTreeState.rootPane,
  };
}

function createPaneGeometry({
  height,
  left,
  paneId,
  tabBarHeight = 44,
  top,
  width,
}: {
  height: number;
  left: number;
  paneId: string;
  tabBarHeight?: number;
  top: number;
  width: number;
}): WorkspacePaneDropGeometry {
  return {
    bodyRect: {
      bottom: top + height,
      height: Math.max(0, height - tabBarHeight),
      left,
      right: left + width,
      top: top + tabBarHeight,
      width,
    },
    paneId,
    paneRect: {
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
    },
    tabBarRect: {
      bottom: top + tabBarHeight,
      height: tabBarHeight,
      left,
      right: left + width,
      top,
      width,
    },
  };
}

function applyWorkspaceTabDragStep(
  state: WorkspaceCanvasState,
  {
    draggedKey,
    newPaneId,
    paneGeometries,
    pointerX,
    pointerY,
    sourcePaneId,
    splitId,
  }: {
    draggedKey: string;
    newPaneId?: string;
    paneGeometries: readonly WorkspacePaneDropGeometry[];
    pointerX: number;
    pointerY: number;
    sourcePaneId: string;
    splitId?: string;
  },
): { nextState: WorkspaceCanvasState; resolved: WorkspacePaneResolvedDropState } {
  const resolved = resolveWorkspacePaneDropStateFromGeometry({
    draggedKey,
    paneGeometries,
    paneId: sourcePaneId,
    pointerX,
    pointerY,
  });

  if (!resolved.intent) {
    return {
      nextState: state,
      resolved,
    };
  }

  if (resolved.intent.kind === "reorder") {
    throw new Error("Scenario drag tests should not resolve reorder intents.");
  }

  if (resolved.intent.kind === "split") {
    if (!newPaneId || !splitId) {
      throw new Error("Split drag scenarios require deterministic split and pane ids.");
    }

    const splitState = workspaceCanvasReducer(state, {
      direction: resolved.intent.splitDirection,
      kind: "split-pane",
      newPaneId,
      paneId: resolved.intent.paneId,
      placement: resolved.intent.splitPlacement,
      ratio: resolved.intent.splitRatio,
      splitId,
    });

    return {
      nextState: workspaceCanvasReducer(splitState, {
        emptySourcePanePolicy: "close",
        key: draggedKey,
        kind: "move-tab-to-pane",
        sourcePaneId,
        targetPaneId: newPaneId,
      }),
      resolved,
    };
  }

  return {
    nextState: workspaceCanvasReducer(state, {
      emptySourcePanePolicy: "close",
      key: draggedKey,
      kind: "move-tab-to-pane",
      placement: resolved.intent.placement ?? undefined,
      sourcePaneId,
      targetKey: resolved.intent.targetKey ?? undefined,
      targetPaneId: resolved.intent.paneId,
    }),
    resolved,
  };
}

describe("canvas drag scenarios", () => {
  test("splitting a tab downward and then moving the remaining tab into that pane collapses the empty source pane", () => {
    const readmeTab = createFileViewerTab("README.md");
    const planTab = createFileViewerTab("docs/plan.md");

    let state = withWorkspaceState({
      activePaneId: "pane-root",
      documents: [readmeTab, planTab],
      rootPane: {
        activeTabKey: planTab.key,
        id: "pane-root",
        kind: "leaf",
        tabOrderKeys: [readmeTab.key, planTab.key],
      },
    });

    const splitStep = applyWorkspaceTabDragStep(state, {
      draggedKey: planTab.key,
      newPaneId: "pane-bottom",
      paneGeometries: [
        createPaneGeometry({ height: 720, left: 0, paneId: "pane-root", top: 0, width: 1200 }),
      ],
      pointerX: 620,
      pointerY: 710,
      sourcePaneId: "pane-root",
      splitId: "split-bottom",
    });

    expect(splitStep.resolved.intent?.kind).toBe("split");
    if (splitStep.resolved.intent?.kind !== "split") {
      throw new Error("Expected bottom-edge drag to resolve a split intent.");
    }
    expect(splitStep.resolved.intent.paneId).toBe("pane-root");
    expect(splitStep.resolved.intent.splitDirection).toBe("column");
    expect(splitStep.resolved.intent.splitPlacement).toBe("after");
    expect(splitStep.resolved.intent.splitRatio).toBeCloseTo(0.58, 2);

    state = splitStep.nextState;

    expect(state.rootPane).toEqual({
      direction: "column",
      first: {
        id: "pane-root",
        kind: "leaf",
      },
      id: "split-bottom",
      kind: "split",
      ratio: splitStep.resolved.intent.splitRatio,
      second: {
        id: "pane-bottom",
        kind: "leaf",
      },
    });
    expect(getWorkspacePaneTabState(state.paneTabStateById, "pane-root")).toEqual({
      activeTabKey: readmeTab.key,
      tabOrderKeys: [readmeTab.key],
    });
    expect(getWorkspacePaneTabState(state.paneTabStateById, "pane-bottom")).toEqual({
      activeTabKey: planTab.key,
      tabOrderKeys: [planTab.key],
    });

    const moveStep = applyWorkspaceTabDragStep(state, {
      draggedKey: readmeTab.key,
      paneGeometries: [
        createPaneGeometry({ height: 360, left: 0, paneId: "pane-root", top: 0, width: 1200 }),
        createPaneGeometry({ height: 360, left: 0, paneId: "pane-bottom", top: 360, width: 1200 }),
      ],
      pointerX: 620,
      pointerY: 560,
      sourcePaneId: "pane-root",
    });

    expect(moveStep.resolved.intent).toEqual({
      kind: "insert",
      paneId: "pane-bottom",
      placement: null,
      surface: "body",
      targetKey: null,
    });

    state = moveStep.nextState;

    expect(inspectWorkspacePaneLayout(state.rootPane).paneIds).toEqual(["pane-bottom"]);
    expect(state.rootPane).toEqual({
      id: "pane-bottom",
      kind: "leaf",
    });
    expect(state.activePaneId).toBe("pane-bottom");
    expect(getWorkspacePaneTabState(state.paneTabStateById, "pane-bottom")).toEqual({
      activeTabKey: readmeTab.key,
      tabOrderKeys: [planTab.key, readmeTab.key],
    });
    expect(state.paneTabStateById["pane-root"]).toBeUndefined();
  });

  test("nested split drag, resize, and close sequences keep pane topology coherent", () => {
    const readmeTab = createFileViewerTab("README.md");
    const planTab = createFileViewerTab("docs/plan.md");
    const appTab = createFileViewerTab("src/app.tsx");

    let state = withWorkspaceState({
      activePaneId: "pane-root",
      documents: [readmeTab, planTab, appTab],
      rootPane: {
        activeTabKey: appTab.key,
        id: "pane-root",
        kind: "leaf",
        tabOrderKeys: [readmeTab.key, planTab.key, appTab.key],
      },
    });

    const bottomSplitStep = applyWorkspaceTabDragStep(state, {
      draggedKey: appTab.key,
      newPaneId: "pane-bottom",
      paneGeometries: [
        createPaneGeometry({ height: 720, left: 0, paneId: "pane-root", top: 0, width: 1200 }),
      ],
      pointerX: 600,
      pointerY: 710,
      sourcePaneId: "pane-root",
      splitId: "split-bottom",
    });

    expect(bottomSplitStep.resolved.intent?.kind).toBe("split");
    if (bottomSplitStep.resolved.intent?.kind !== "split") {
      throw new Error("Expected bottom-edge drag to resolve a split intent.");
    }

    state = bottomSplitStep.nextState;

    const rightSplitStep = applyWorkspaceTabDragStep(state, {
      draggedKey: planTab.key,
      newPaneId: "pane-right",
      paneGeometries: [
        createPaneGeometry({ height: 360, left: 0, paneId: "pane-root", top: 0, width: 1200 }),
        createPaneGeometry({ height: 360, left: 0, paneId: "pane-bottom", top: 360, width: 1200 }),
      ],
      pointerX: 1188,
      pointerY: 180,
      sourcePaneId: "pane-root",
      splitId: "split-right",
    });

    expect(rightSplitStep.resolved.intent?.kind).toBe("split");
    if (rightSplitStep.resolved.intent?.kind !== "split") {
      throw new Error("Expected right-edge drag to resolve a split intent.");
    }
    expect(rightSplitStep.resolved.intent.paneId).toBe("pane-root");
    expect(rightSplitStep.resolved.intent.splitDirection).toBe("row");
    expect(rightSplitStep.resolved.intent.splitPlacement).toBe("after");
    expect(rightSplitStep.resolved.intent.splitRatio).toBeCloseTo(0.58, 2);

    state = rightSplitStep.nextState;

    expect(state.rootPane).toEqual({
      direction: "column",
      first: {
        direction: "row",
        first: {
          id: "pane-root",
          kind: "leaf",
        },
        id: "split-right",
        kind: "split",
        ratio: rightSplitStep.resolved.intent.splitRatio,
        second: {
          id: "pane-right",
          kind: "leaf",
        },
      },
      id: "split-bottom",
      kind: "split",
      ratio: bottomSplitStep.resolved.intent.splitRatio,
      second: {
        id: "pane-bottom",
        kind: "leaf",
      },
    });

    state = workspaceCanvasReducer(state, {
      kind: "set-split-ratio",
      ratio: 0.63,
      splitId: "split-right",
    });
    state = workspaceCanvasReducer(state, {
      kind: "set-split-ratio",
      ratio: 0.54,
      splitId: "split-bottom",
    });

    expect(state.rootPane).toEqual({
      direction: "column",
      first: {
        direction: "row",
        first: {
          id: "pane-root",
          kind: "leaf",
        },
        id: "split-right",
        kind: "split",
        ratio: 0.63,
        second: {
          id: "pane-right",
          kind: "leaf",
        },
      },
      id: "split-bottom",
      kind: "split",
      ratio: 0.54,
      second: {
        id: "pane-bottom",
        kind: "leaf",
      },
    });

    state = workspaceCanvasReducer(state, {
      key: planTab.key,
      kind: "close-document",
    });

    expect(state.rootPane).toEqual({
      direction: "column",
      first: {
        id: "pane-root",
        kind: "leaf",
      },
      id: "split-bottom",
      kind: "split",
      ratio: 0.54,
      second: {
        id: "pane-bottom",
        kind: "leaf",
      },
    });
    expect(inspectWorkspacePaneLayout(state.rootPane).paneIds).toEqual([
      "pane-root",
      "pane-bottom",
    ]);
    expect(state.activePaneId).toBe("pane-root");
    expect(getWorkspacePaneTabState(state.paneTabStateById, "pane-root")).toEqual({
      activeTabKey: readmeTab.key,
      tabOrderKeys: [readmeTab.key],
    });
    expect(getWorkspacePaneTabState(state.paneTabStateById, "pane-bottom")).toEqual({
      activeTabKey: appTab.key,
      tabOrderKeys: [appTab.key],
    });
    expect(state.paneTabStateById["pane-right"]).toBeUndefined();
    expect(state.documentsByKey[planTab.key]).toBeUndefined();
  });

  test("same-pane center drags are stable no-ops across repeated attempts", () => {
    const readmeTab = createFileViewerTab("README.md");
    const planTab = createFileViewerTab("docs/plan.md");
    const state = withWorkspaceState({
      activePaneId: "pane-root",
      documents: [readmeTab, planTab],
      rootPane: {
        activeTabKey: planTab.key,
        id: "pane-root",
        kind: "leaf",
        tabOrderKeys: [readmeTab.key, planTab.key],
      },
    });

    const firstAttempt = applyWorkspaceTabDragStep(state, {
      draggedKey: planTab.key,
      paneGeometries: [
        createPaneGeometry({ height: 720, left: 0, paneId: "pane-root", top: 0, width: 1200 }),
      ],
      pointerX: 600,
      pointerY: 360,
      sourcePaneId: "pane-root",
    });
    const secondAttempt = applyWorkspaceTabDragStep(firstAttempt.nextState, {
      draggedKey: planTab.key,
      paneGeometries: [
        createPaneGeometry({ height: 720, left: 0, paneId: "pane-root", top: 0, width: 1200 }),
      ],
      pointerX: 610,
      pointerY: 350,
      sourcePaneId: "pane-root",
    });

    expect(firstAttempt.resolved).toEqual({
      hoveredPaneId: "pane-root",
      intent: null,
    });
    expect(secondAttempt.resolved).toEqual({
      hoveredPaneId: "pane-root",
      intent: null,
    });
    expect(firstAttempt.nextState).toBe(state);
    expect(secondAttempt.nextState).toBe(state);
  });
});

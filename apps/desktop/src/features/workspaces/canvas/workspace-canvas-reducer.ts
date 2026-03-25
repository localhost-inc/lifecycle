import {
  closeWorkspacePaneLayout,
  createWorkspacePane,
  getWorkspacePane,
  hasWorkspacePane,
  inspectWorkspacePaneLayout,
  resetAllWorkspacePaneSplitRatios,
  splitWorkspacePaneLayout,
  updateWorkspacePaneLayoutSplit,
} from "@/features/workspaces/lib/workspace-pane-layout";
import {
  createDefaultWorkspacePaneTabState,
  findWorkspacePaneIdContainingTab,
  getWorkspaceTab,
  getWorkspacePaneTabState,
  MAX_CLOSED_TAB_STACK_SIZE,
  type ClosedTabEntry,
  type WorkspacePaneTabState,
  type WorkspacePaneTabStateById,
  type WorkspaceCanvasTab,
  type WorkspaceCanvasTabsByKey,
  type WorkspaceCanvasTabStateByKey,
  type WorkspaceCanvasTabViewState,
  type WorkspaceCanvasState,
} from "@/features/workspaces/state/workspace-canvas-state";
import type { OpenSurfaceRequest } from "@/features/workspaces/canvas/workspace-canvas-requests";
import {
  areStringArraysEqual,
  getWorkspaceTabKeyAfterClose,
  type WorkspaceTabPlacement,
} from "@/features/workspaces/canvas/workspace-canvas-tabs";
import {
  createWorkspaceSurfaceTab,
  getWorkspaceSurfaceTabKey,
} from "@/features/workspaces/surfaces/workspace-surface-registry";

export type WorkspaceCanvasAction =
  | { kind: "open-tab"; request: OpenSurfaceRequest }
  | { kind: "reopen-closed-tab" }
  | { kind: "select-pane"; paneId: string }
  | { key: string | null; kind: "select-tab"; paneId: string }
  | { key: string; kind: "close-tab" }
  | { keys: string[]; kind: "reconcile-pane-visible-tab-order"; paneId: string }
  | { key: string; kind: "set-tab-view-state"; viewState: WorkspaceCanvasTabViewState | null }
  | {
      emptySourcePanePolicy: "close" | "preserve";
      key: string;
      kind: "move-tab-to-pane";
      placement?: WorkspaceTabPlacement;
      sourcePaneId: string;
      targetKey?: string;
      targetPaneId: string;
    }
  | {
      direction: "column" | "row";
      kind: "split-pane";
      newPaneId: string;
      paneId: string;
      placement: "after" | "before";
      ratio?: number;
      splitId: string;
    }
  | { kind: "collapse-pane"; paneId: string }
  | { kind: "close-pane"; paneId: string }
  | { kind: "set-split-ratio"; ratio: number; splitId: string }
  | { kind: "reset-all-split-ratios" }
  | { kind: "update-tab-label"; key: string; label: string };

function appendWorkspaceTabKey(keys: readonly string[], key: string): string[] {
  return [...keys.filter((existingKey) => existingKey !== key), key];
}

function removeWorkspaceTabKey(keys: readonly string[], key: string): string[] {
  return keys.filter((existingKey) => existingKey !== key);
}

function insertWorkspaceTabKey(
  keys: readonly string[],
  key: string,
  targetKey: string,
  placement: WorkspaceTabPlacement,
): string[] {
  const nextKeys = removeWorkspaceTabKey(keys, key);
  const targetIndex = nextKeys.indexOf(targetKey);
  if (targetIndex < 0) {
    return appendWorkspaceTabKey(nextKeys, key);
  }

  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  return [...nextKeys.slice(0, insertIndex), key, ...nextKeys.slice(insertIndex)];
}

function omitWorkspaceTabState(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
  key: string,
): WorkspaceCanvasTabStateByKey {
  if (!(key in tabStateByKey)) {
    return tabStateByKey;
  }

  const nextTabStateByKey = {
    ...tabStateByKey,
  };
  delete nextTabStateByKey[key];
  return nextTabStateByKey;
}

function updateWorkspaceTabState(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
  key: string,
  nextTabState: {
    hidden?: boolean;
    viewState?: WorkspaceCanvasTabViewState;
  } | null,
): WorkspaceCanvasTabStateByKey {
  if (!nextTabState?.hidden && !nextTabState?.viewState) {
    return omitWorkspaceTabState(tabStateByKey, key);
  }

  const normalizedNextTabState = {
    ...(nextTabState.hidden ? { hidden: true } : {}),
    ...(nextTabState.viewState ? { viewState: nextTabState.viewState } : {}),
  };
  const currentTabState = tabStateByKey[key];
  if (
    currentTabState?.hidden === normalizedNextTabState.hidden &&
    currentTabState?.viewState?.fileMode === normalizedNextTabState.viewState?.fileMode &&
    currentTabState?.viewState?.scrollTop === normalizedNextTabState.viewState?.scrollTop &&
    currentTabState?.viewState?.stickToBottom === normalizedNextTabState.viewState?.stickToBottom
  ) {
    return tabStateByKey;
  }

  return {
    ...tabStateByKey,
    [key]: normalizedNextTabState,
  };
}

function updateWorkspacePaneTabState(
  paneTabStateById: WorkspacePaneTabStateById,
  paneId: string,
  updater: (paneTabState: WorkspacePaneTabState) => WorkspacePaneTabState,
): WorkspacePaneTabStateById {
  const paneTabState = getWorkspacePaneTabState(paneTabStateById, paneId);
  const nextPaneTabState = updater(paneTabState);

  if (
    paneTabState.activeTabKey === nextPaneTabState.activeTabKey &&
    areStringArraysEqual(paneTabState.tabOrderKeys, nextPaneTabState.tabOrderKeys)
  ) {
    return paneTabStateById;
  }

  return {
    ...paneTabStateById,
    [paneId]: nextPaneTabState,
  };
}

function omitWorkspacePaneTabState(
  paneTabStateById: WorkspacePaneTabStateById,
  paneId: string,
): WorkspacePaneTabStateById {
  if (!(paneId in paneTabStateById)) {
    return paneTabStateById;
  }

  const nextPaneTabStateById = {
    ...paneTabStateById,
  };
  delete nextPaneTabStateById[paneId];
  return nextPaneTabStateById;
}

function upsertWorkspaceTab(
  tabsByKey: WorkspaceCanvasTabsByKey,
  tab: WorkspaceCanvasTabsByKey[string],
): WorkspaceCanvasTabsByKey {
  return {
    ...tabsByKey,
    [tab.key]: tab,
  };
}

function removeWorkspaceTab(
  tabsByKey: WorkspaceCanvasTabsByKey,
  key: string,
): WorkspaceCanvasTabsByKey {
  if (!(key in tabsByKey)) {
    return tabsByKey;
  }

  const nextTabsByKey = {
    ...tabsByKey,
  };
  delete nextTabsByKey[key];
  return nextTabsByKey;
}

function appendWorkspaceTabKeys(keys: readonly string[], nextKeys: readonly string[]): string[] {
  return nextKeys.reduce((current, key) => appendWorkspaceTabKey(current, key), [...keys]);
}

function resolveWorkspaceTargetPaneId(state: WorkspaceCanvasState, paneId?: string): string {
  const layout = inspectWorkspacePaneLayout(state.rootPane);

  if (paneId) {
    const requestedPane = getWorkspacePane(state.rootPane, paneId);
    if (requestedPane) {
      return requestedPane.id;
    }
  }

  if (state.activePaneId) {
    const activePane = getWorkspacePane(state.rootPane, state.activePaneId);
    if (activePane) {
      return activePane.id;
    }
  }

  return layout.firstPane.id;
}

function selectWorkspacePaneTab(
  state: WorkspaceCanvasState,
  paneId: string,
  selectedTabKey: string | null,
): WorkspaceCanvasState {
  const pane = getWorkspacePane(state.rootPane, paneId);
  if (!pane) {
    return state;
  }

  const paneTabState = getWorkspacePaneTabState(state.paneTabStateById, pane.id);
  if (selectedTabKey !== null && !paneTabState.tabOrderKeys.includes(selectedTabKey)) {
    return state;
  }

  if (state.activePaneId === pane.id && paneTabState.activeTabKey === selectedTabKey) {
    return state;
  }

  return {
    ...state,
    activePaneId: pane.id,
    paneTabStateById: updateWorkspacePaneTabState(state.paneTabStateById, pane.id, (pane) => ({
      ...pane,
      activeTabKey: selectedTabKey,
    })),
  };
}

function closeWorkspacePaneIfEmpty(
  state: WorkspaceCanvasState,
  paneId: string,
): WorkspaceCanvasState {
  const pane = getWorkspacePane(state.rootPane, paneId);
  if (!pane) {
    return state;
  }

  const paneTabState = getWorkspacePaneTabState(state.paneTabStateById, pane.id);
  if (paneTabState.tabOrderKeys.length > 0) {
    return state;
  }

  const closeResult = closeWorkspacePaneLayout(state.rootPane, pane.id);
  if (!closeResult.didClose || !closeResult.survivingPaneId) {
    return state;
  }

  return {
    ...state,
    activePaneId: state.activePaneId === pane.id ? closeResult.survivingPaneId : state.activePaneId,
    paneTabStateById: omitWorkspacePaneTabState(state.paneTabStateById, pane.id),
    rootPane: closeResult.nextRoot,
  };
}

function collapseWorkspacePane(state: WorkspaceCanvasState, paneId: string): WorkspaceCanvasState {
  const pane = getWorkspacePane(state.rootPane, paneId);
  if (!pane) {
    return state;
  }

  const closeResult = closeWorkspacePaneLayout(state.rootPane, pane.id);
  if (!closeResult.didClose || !closeResult.survivingPaneId) {
    return state;
  }

  return {
    ...state,
    activePaneId: state.activePaneId === pane.id ? closeResult.survivingPaneId : state.activePaneId,
    paneTabStateById: omitWorkspacePaneTabState(state.paneTabStateById, pane.id),
    rootPane: closeResult.nextRoot,
  };
}

export function workspaceCanvasReducer(
  state: WorkspaceCanvasState,
  action: WorkspaceCanvasAction,
): WorkspaceCanvasState {
  switch (action.kind) {
    case "open-tab": {
      const request = action.request;
      const key = getWorkspaceSurfaceTabKey(request);
      const existingPaneId = findWorkspacePaneIdContainingTab(
        state.rootPane,
        state.paneTabStateById,
        key,
      );
      const targetPaneId = existingPaneId ?? resolveWorkspaceTargetPaneId(state);
      const existingTab = getWorkspaceTab(state.tabsByKey, key);
      const nextTab = createWorkspaceSurfaceTab(request, existingTab);

      return {
        ...state,
        activePaneId: targetPaneId,
        tabsByKey: upsertWorkspaceTab(state.tabsByKey, nextTab),
        paneTabStateById: updateWorkspacePaneTabState(
          state.paneTabStateById,
          targetPaneId,
          (pane) => ({
            ...pane,
            activeTabKey: key,
            tabOrderKeys: existingPaneId
              ? pane.tabOrderKeys
              : appendWorkspaceTabKey(pane.tabOrderKeys, key),
          }),
        ),
      };
    }
    case "select-pane":
      return hasWorkspacePane(state.rootPane, action.paneId)
        ? {
            ...state,
            activePaneId: action.paneId,
          }
        : state;
    case "select-tab":
      return selectWorkspacePaneTab(state, action.paneId, action.key);
    case "close-tab": {
      const closingTab = getWorkspaceTab(state.tabsByKey, action.key);
      const closingViewState = state.tabStateByKey[action.key]?.viewState ?? null;
      const nextClosedTabStack = closingTab
        ? [
            {
              tab: closingTab,
              viewState: closingViewState,
            } satisfies ClosedTabEntry,
            ...state.closedTabStack,
          ].slice(0, MAX_CLOSED_TAB_STACK_SIZE)
        : state.closedTabStack;

      const paneId = findWorkspacePaneIdContainingTab(
        state.rootPane,
        state.paneTabStateById,
        action.key,
      );
      if (!paneId) {
        return {
          ...state,
          closedTabStack: nextClosedTabStack,
          tabsByKey: removeWorkspaceTab(state.tabsByKey, action.key),
          tabStateByKey: omitWorkspaceTabState(state.tabStateByKey, action.key),
        };
      }

      const paneTabState = getWorkspacePaneTabState(state.paneTabStateById, paneId);
      const nextActiveKey =
        paneTabState.activeTabKey === action.key
          ? getWorkspaceTabKeyAfterClose(paneTabState.tabOrderKeys, action.key)
          : paneTabState.activeTabKey;
      const nextState: WorkspaceCanvasState = {
        ...state,
        closedTabStack: nextClosedTabStack,
        tabsByKey: removeWorkspaceTab(state.tabsByKey, action.key),
        paneTabStateById: updateWorkspacePaneTabState(
          state.paneTabStateById,
          paneId,
          (nextPane) => ({
            ...nextPane,
            activeTabKey:
              paneTabState.activeTabKey === action.key ? nextActiveKey : nextPane.activeTabKey,
            tabOrderKeys: removeWorkspaceTabKey(nextPane.tabOrderKeys, action.key),
          }),
        ),
        tabStateByKey: omitWorkspaceTabState(state.tabStateByKey, action.key),
      };

      if (state.activePaneId === paneId && paneTabState.activeTabKey === action.key) {
        return closeWorkspacePaneIfEmpty(
          selectWorkspacePaneTab(nextState, paneId, nextActiveKey),
          paneId,
        );
      }

      return closeWorkspacePaneIfEmpty(nextState, paneId);
    }
    case "reopen-closed-tab": {
      const stack = [...state.closedTabStack];
      let entry: ClosedTabEntry | undefined;

      while (stack.length > 0) {
        const candidate = stack.shift()!;
        if (!(candidate.tab.key in state.tabsByKey)) {
          entry = candidate;
          break;
        }
      }

      if (!entry) {
        return state;
      }

      const targetPaneId = resolveWorkspaceTargetPaneId(state);
      return {
        ...state,
        closedTabStack: stack,
        tabsByKey: upsertWorkspaceTab(state.tabsByKey, entry.tab),
        paneTabStateById: updateWorkspacePaneTabState(
          state.paneTabStateById,
          targetPaneId,
          (pane) => ({
            ...pane,
            activeTabKey: entry.tab.key,
            tabOrderKeys: appendWorkspaceTabKey(pane.tabOrderKeys, entry.tab.key),
          }),
        ),
        tabStateByKey: entry.viewState
          ? updateWorkspaceTabState(state.tabStateByKey, entry.tab.key, {
              viewState: entry.viewState,
            })
          : state.tabStateByKey,
      };
    }
    case "reconcile-pane-visible-tab-order": {
      const pane = getWorkspacePane(state.rootPane, action.paneId);
      if (!pane) {
        return state;
      }

      const paneTabState = getWorkspacePaneTabState(state.paneTabStateById, pane.id);
      const preservedKeys = paneTabState.tabOrderKeys.filter((key) => !action.keys.includes(key));
      const nextKeys = appendWorkspaceTabKeys(action.keys, preservedKeys);
      if (areStringArraysEqual(paneTabState.tabOrderKeys, nextKeys)) {
        return state;
      }

      return {
        ...state,
        paneTabStateById: updateWorkspacePaneTabState(
          state.paneTabStateById,
          action.paneId,
          (nextPane) => ({
            ...nextPane,
            tabOrderKeys: nextKeys,
          }),
        ),
      };
    }
    case "move-tab-to-pane": {
      if (action.sourcePaneId === action.targetPaneId) {
        return state;
      }

      const sourcePane = getWorkspacePane(state.rootPane, action.sourcePaneId);
      const targetPane = getWorkspacePane(state.rootPane, action.targetPaneId);
      if (!sourcePane || !targetPane) {
        return state;
      }

      const sourcePaneTabState = getWorkspacePaneTabState(state.paneTabStateById, sourcePane.id);
      if (!sourcePaneTabState.tabOrderKeys.includes(action.key)) {
        return state;
      }

      const nextSourceActiveKey =
        sourcePaneTabState.activeTabKey === action.key
          ? getWorkspaceTabKeyAfterClose(sourcePaneTabState.tabOrderKeys, action.key)
          : sourcePaneTabState.activeTabKey;
      const nextPaneTabStateById = updateWorkspacePaneTabState(
        state.paneTabStateById,
        sourcePane.id,
        (nextPane) => ({
          ...nextPane,
          activeTabKey: nextSourceActiveKey,
          tabOrderKeys: removeWorkspaceTabKey(nextPane.tabOrderKeys, action.key),
        }),
      );
      const nextPaneTabStateWithTarget = updateWorkspacePaneTabState(
        nextPaneTabStateById,
        targetPane.id,
        (nextPane) => ({
          ...nextPane,
          activeTabKey: action.key,
          tabOrderKeys:
            action.targetKey && action.placement
              ? insertWorkspaceTabKey(
                  nextPane.tabOrderKeys,
                  action.key,
                  action.targetKey,
                  action.placement,
                )
              : appendWorkspaceTabKey(nextPane.tabOrderKeys, action.key),
        }),
      );

      const nextState = {
        ...state,
        activePaneId: targetPane.id,
        paneTabStateById: nextPaneTabStateWithTarget,
      };

      return action.emptySourcePanePolicy === "close"
        ? closeWorkspacePaneIfEmpty(nextState, sourcePane.id)
        : nextState;
    }
    case "set-tab-view-state": {
      const nextTabStateByKey = updateWorkspaceTabState(state.tabStateByKey, action.key, {
        ...(state.tabStateByKey[action.key]?.hidden ? { hidden: true } : {}),
        ...(action.viewState ? { viewState: action.viewState } : {}),
      });

      return nextTabStateByKey === state.tabStateByKey
        ? state
        : {
            ...state,
            tabStateByKey: nextTabStateByKey,
          };
    }
    case "split-pane": {
      const pane = getWorkspacePane(state.rootPane, action.paneId);
      if (!pane) {
        return state;
      }

      const nextPane = createWorkspacePane(action.newPaneId);
      const splitResult = splitWorkspacePaneLayout(state.rootPane, action.paneId, {
        direction: action.direction,
        first: action.placement === "before" ? nextPane : pane,
        id: action.splitId,
        kind: "split",
        ratio: action.ratio ?? 0.5,
        second: action.placement === "before" ? pane : nextPane,
      });
      if (!splitResult.didSplit) {
        return state;
      }

      return {
        ...state,
        activePaneId: nextPane.id,
        paneTabStateById: {
          ...state.paneTabStateById,
          [nextPane.id]: createDefaultWorkspacePaneTabState(),
        },
        rootPane: splitResult.nextRoot,
      };
    }
    case "collapse-pane": {
      return collapseWorkspacePane(state, action.paneId);
    }
    case "close-pane": {
      return closeWorkspacePaneIfEmpty(state, action.paneId);
    }
    case "set-split-ratio":
      return {
        ...state,
        rootPane: updateWorkspacePaneLayoutSplit(state.rootPane, action.splitId, (split) => ({
          ...split,
          ratio: action.ratio,
        })).nextRoot,
      };
    case "reset-all-split-ratios":
      return {
        ...state,
        rootPane: resetAllWorkspacePaneSplitRatios(state.rootPane),
      };
    case "update-tab-label": {
      const existingTab = getWorkspaceTab(state.tabsByKey, action.key);
      if (!existingTab || !("label" in existingTab)) {
        return state;
      }
      if (existingTab.label === action.label) {
        return state;
      }
      return {
        ...state,
        tabsByKey: {
          ...state.tabsByKey,
          [action.key]: {
            ...existingTab,
            label: action.label,
          } as WorkspaceCanvasTab,
        },
      };
    }
    default:
      return state;
  }
}

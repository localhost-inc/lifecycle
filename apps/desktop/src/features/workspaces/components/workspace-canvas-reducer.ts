import {
  closeWorkspacePaneLayout,
  createWorkspacePane,
  getWorkspacePane,
  hasWorkspacePane,
  inspectWorkspacePaneLayout,
  splitWorkspacePaneLayout,
  updateWorkspacePaneLayoutSplit,
} from "../lib/workspace-pane-layout";
import {
  changesDiffTabKey,
  commitDiffTabKey,
  createChangesDiffTab,
  createCommitDiffTab,
  createFileViewerTab,
  createPullRequestTab,
  createDefaultWorkspacePaneTabState,
  fileViewerTabKey,
  findWorkspacePaneIdContainingTab,
  getWorkspaceDocument,
  getWorkspacePaneTabState,
  isChangesDiffDocument,
  pullRequestTabKey,
  type WorkspacePaneTabState,
  type WorkspacePaneTabStateById,
  type WorkspaceCanvasDocument,
  type WorkspaceCanvasDocumentsByKey,
  type WorkspaceCanvasTabStateByKey,
  type WorkspaceCanvasTabViewState,
  type WorkspaceCanvasState,
} from "../state/workspace-canvas-state";
import type { OpenDocumentRequest } from "./workspace-canvas-requests";
import {
  areStringArraysEqual,
  getWorkspaceTabKeyAfterClose,
  type WorkspaceTabPlacement,
} from "./workspace-canvas-tabs";

export type WorkspaceCanvasAction =
  | { kind: "open-document"; request: OpenDocumentRequest }
  | { kind: "select-pane"; paneId: string }
  | { key: string | null; kind: "select-tab"; paneId: string }
  | { key: string; kind: "close-document" }
  | { key: string; kind: "hide-runtime-tab" }
  | { key: string; kind: "show-runtime-tab"; paneId?: string; select: boolean }
  | { keys: string[]; kind: "set-hidden-runtime-tab-keys" }
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
  | { kind: "set-split-ratio"; ratio: number; splitId: string };

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
    currentTabState?.viewState?.scrollTop === normalizedNextTabState.viewState?.scrollTop
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

function reconcileWorkspaceHiddenRuntimeTabState(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
  hiddenRuntimeTabKeys: readonly string[],
): WorkspaceCanvasTabStateByKey {
  const hiddenRuntimeTabKeySet = new Set(hiddenRuntimeTabKeys);
  let nextTabStateByKey = tabStateByKey;

  for (const [key, tabState] of Object.entries(tabStateByKey)) {
    if (!key.startsWith("terminal:")) {
      continue;
    }

    const nextTabState = {
      ...(hiddenRuntimeTabKeySet.has(key) ? { hidden: true } : {}),
      ...(tabState.viewState ? { viewState: tabState.viewState } : {}),
    };
    nextTabStateByKey = updateWorkspaceTabState(nextTabStateByKey, key, nextTabState);
  }

  for (const key of hiddenRuntimeTabKeySet) {
    if (key in nextTabStateByKey && nextTabStateByKey[key]?.hidden) {
      continue;
    }

    nextTabStateByKey = updateWorkspaceTabState(nextTabStateByKey, key, { hidden: true });
  }

  return nextTabStateByKey;
}

function upsertWorkspaceDocument(
  documentsByKey: WorkspaceCanvasDocumentsByKey,
  document: WorkspaceCanvasDocument,
): WorkspaceCanvasDocumentsByKey {
  return {
    ...documentsByKey,
    [document.key]: document,
  };
}

function removeWorkspaceDocument(
  documentsByKey: WorkspaceCanvasDocumentsByKey,
  key: string,
): WorkspaceCanvasDocumentsByKey {
  if (!(key in documentsByKey)) {
    return documentsByKey;
  }

  const nextDocumentsByKey = {
    ...documentsByKey,
  };
  delete nextDocumentsByKey[key];
  return nextDocumentsByKey;
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

function removeHiddenRuntimeTabsFromPaneState(
  paneTabStateById: WorkspaceCanvasState["paneTabStateById"],
  hiddenRuntimeTabKeySet: ReadonlySet<string>,
): WorkspaceCanvasState["paneTabStateById"] {
  let nextPaneTabStateById = paneTabStateById;

  for (const [paneId, paneTabState] of Object.entries(paneTabStateById)) {
    const activeTabKey =
      paneTabState.activeTabKey && hiddenRuntimeTabKeySet.has(paneTabState.activeTabKey)
        ? null
        : paneTabState.activeTabKey;
    const tabOrderKeys = paneTabState.tabOrderKeys.filter(
      (key) => !hiddenRuntimeTabKeySet.has(key),
    );

    if (
      activeTabKey === paneTabState.activeTabKey &&
      areStringArraysEqual(tabOrderKeys, paneTabState.tabOrderKeys)
    ) {
      continue;
    }

    nextPaneTabStateById = updateWorkspacePaneTabState(nextPaneTabStateById, paneId, () => ({
      activeTabKey,
      tabOrderKeys,
    }));
  }

  return nextPaneTabStateById;
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

function collapseWorkspacePane(
  state: WorkspaceCanvasState,
  paneId: string,
): WorkspaceCanvasState {
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
    case "open-document": {
      const request = action.request;
      const existingPaneForChanges =
        request.kind === "changes-diff"
          ? findWorkspacePaneIdContainingTab(
              state.rootPane,
              state.paneTabStateById,
              changesDiffTabKey(),
            )
          : null;
      const existingPaneForFile =
        request.kind === "file-viewer"
          ? findWorkspacePaneIdContainingTab(
              state.rootPane,
              state.paneTabStateById,
              fileViewerTabKey(request.filePath),
            )
          : null;
      const existingPaneForCommit =
        request.kind === "commit-diff"
          ? findWorkspacePaneIdContainingTab(
              state.rootPane,
              state.paneTabStateById,
              commitDiffTabKey(request.commit.sha),
            )
          : null;
      const existingPaneForPullRequest =
        request.kind === "pull-request"
          ? findWorkspacePaneIdContainingTab(
              state.rootPane,
              state.paneTabStateById,
              pullRequestTabKey(request.pullRequest.number),
            )
          : null;

      if (request.kind === "changes-diff") {
        const key = changesDiffTabKey();
        const existingPaneId = existingPaneForChanges;
        const targetPaneId = existingPaneId ?? resolveWorkspaceTargetPaneId(state);
        const existingDocument = getWorkspaceDocument(state.documentsByKey, key);

        return {
          ...state,
          activePaneId: targetPaneId,
          documentsByKey: upsertWorkspaceDocument(
            state.documentsByKey,
            existingDocument && isChangesDiffDocument(existingDocument)
              ? { ...existingDocument, focusPath: request.focusPath }
              : createChangesDiffTab(request.focusPath),
          ),
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

      if (request.kind === "commit-diff") {
        const key = commitDiffTabKey(request.commit.sha);
        const existingPaneId = existingPaneForCommit;
        const targetPaneId = existingPaneId ?? resolveWorkspaceTargetPaneId(state);
        const nextTab = createCommitDiffTab(request.commit);

        return {
          ...state,
          activePaneId: targetPaneId,
          documentsByKey: upsertWorkspaceDocument(state.documentsByKey, nextTab),
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

      if (request.kind === "file-viewer") {
        const key = fileViewerTabKey(request.filePath);
        const existingPaneId = existingPaneForFile;
        const targetPaneId = existingPaneId ?? resolveWorkspaceTargetPaneId(state);
        const nextTab = createFileViewerTab(request.filePath);

        return {
          ...state,
          activePaneId: targetPaneId,
          documentsByKey: upsertWorkspaceDocument(state.documentsByKey, nextTab),
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

      if (request.kind === "pull-request") {
        const key = pullRequestTabKey(request.pullRequest.number);
        const existingPaneId = existingPaneForPullRequest;
        const targetPaneId = existingPaneId ?? resolveWorkspaceTargetPaneId(state);
        const nextTab = createPullRequestTab(request.pullRequest);

        return {
          ...state,
          activePaneId: targetPaneId,
          documentsByKey: upsertWorkspaceDocument(state.documentsByKey, nextTab),
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

      return state;
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
    case "close-document": {
      const paneId = findWorkspacePaneIdContainingTab(
        state.rootPane,
        state.paneTabStateById,
        action.key,
      );
      if (!paneId) {
        return {
          ...state,
          documentsByKey: removeWorkspaceDocument(state.documentsByKey, action.key),
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
        documentsByKey: removeWorkspaceDocument(state.documentsByKey, action.key),
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
    case "hide-runtime-tab": {
      const paneId = findWorkspacePaneIdContainingTab(
        state.rootPane,
        state.paneTabStateById,
        action.key,
      );
      if (!paneId) {
        return {
          ...state,
          tabStateByKey: updateWorkspaceTabState(state.tabStateByKey, action.key, {
            hidden: true,
          }),
        };
      }

      const paneTabState = getWorkspacePaneTabState(state.paneTabStateById, paneId);
      const nextActiveKey =
        paneTabState.activeTabKey === action.key
          ? getWorkspaceTabKeyAfterClose(paneTabState.tabOrderKeys, action.key)
          : paneTabState.activeTabKey;
      const nextState: WorkspaceCanvasState = {
        ...state,
        tabStateByKey: updateWorkspaceTabState(state.tabStateByKey, action.key, {
          hidden: true,
        }),
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
      };

      if (state.activePaneId === paneId && paneTabState.activeTabKey === action.key) {
        return closeWorkspacePaneIfEmpty(
          selectWorkspacePaneTab(nextState, paneId, nextActiveKey),
          paneId,
        );
      }

      return closeWorkspacePaneIfEmpty(nextState, paneId);
    }
    case "show-runtime-tab": {
      const existingPaneId = findWorkspacePaneIdContainingTab(
        state.rootPane,
        state.paneTabStateById,
        action.key,
      );
      const requestedPaneId = action.paneId
        ? resolveWorkspaceTargetPaneId(state, action.paneId)
        : null;
      const restoredTabState = state.tabStateByKey[action.key]?.viewState
        ? { viewState: state.tabStateByKey[action.key]?.viewState }
        : null;
      if (existingPaneId) {
        if (requestedPaneId && requestedPaneId !== existingPaneId) {
          const existingPaneTabState = getWorkspacePaneTabState(
            state.paneTabStateById,
            existingPaneId,
          );
          const nextExistingActiveKey =
            existingPaneTabState.activeTabKey === action.key
              ? getWorkspaceTabKeyAfterClose(existingPaneTabState.tabOrderKeys, action.key)
              : existingPaneTabState.activeTabKey;
          const nextPaneTabStateById = updateWorkspacePaneTabState(
            updateWorkspacePaneTabState(state.paneTabStateById, existingPaneId, (pane) => ({
              ...pane,
              activeTabKey:
                existingPaneTabState.activeTabKey === action.key
                  ? nextExistingActiveKey
                  : pane.activeTabKey,
              tabOrderKeys: removeWorkspaceTabKey(pane.tabOrderKeys, action.key),
            })),
            requestedPaneId,
            (pane) => ({
              ...pane,
              activeTabKey: action.select ? action.key : pane.activeTabKey,
              tabOrderKeys: appendWorkspaceTabKey(pane.tabOrderKeys, action.key),
            }),
          );

          return {
            ...state,
            activePaneId: action.select ? requestedPaneId : state.activePaneId,
            tabStateByKey: updateWorkspaceTabState(
              state.tabStateByKey,
              action.key,
              restoredTabState,
            ),
            paneTabStateById: nextPaneTabStateById,
          };
        }

        return {
          ...state,
          activePaneId: action.select ? existingPaneId : state.activePaneId,
          tabStateByKey: updateWorkspaceTabState(state.tabStateByKey, action.key, restoredTabState),
          paneTabStateById: updateWorkspacePaneTabState(
            state.paneTabStateById,
            existingPaneId,
            (pane) => ({
              ...pane,
              activeTabKey: action.select ? action.key : pane.activeTabKey,
            }),
          ),
        };
      }

      const targetPaneId = resolveWorkspaceTargetPaneId(state, action.paneId);
      return {
        ...state,
        activePaneId: action.select ? targetPaneId : state.activePaneId,
        tabStateByKey: updateWorkspaceTabState(state.tabStateByKey, action.key, restoredTabState),
        paneTabStateById: updateWorkspacePaneTabState(
          state.paneTabStateById,
          targetPaneId,
          (pane) => ({
            ...pane,
            activeTabKey: action.select ? action.key : pane.activeTabKey,
            tabOrderKeys: appendWorkspaceTabKey(pane.tabOrderKeys, action.key),
          }),
        ),
      };
    }
    case "set-hidden-runtime-tab-keys":
      return {
        ...state,
        paneTabStateById: removeHiddenRuntimeTabsFromPaneState(
          state.paneTabStateById,
          new Set(action.keys),
        ),
        tabStateByKey: reconcileWorkspaceHiddenRuntimeTabState(state.tabStateByKey, action.keys),
      };
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
    default:
      return state;
  }
}

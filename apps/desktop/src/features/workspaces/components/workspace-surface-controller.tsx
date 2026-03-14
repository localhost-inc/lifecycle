import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQueryClient } from "../../../query";
import { recordWorkspaceFileUsage } from "../../files/lib/workspace-file-usage";
import { useWorkspaceFileSessions } from "../../files/state/workspace-file-sessions";
import {
  createTerminal,
  detachTerminal,
  renameTerminal,
  terminalHasLiveSession,
  type CreateTerminalRequest,
  type HarnessProvider,
} from "../../terminals/api";
import { terminalKeys } from "../../terminals/hooks";
import { useTerminalResponseReady } from "../../terminals/state/terminal-response-ready-provider";
import { subscribeToNativeWorkspaceShortcutEvents } from "../native-shortcuts-api";
import { inspectWorkspacePaneLayout, requireWorkspacePane } from "../lib/workspace-surface-panes";
import { formatWorkspaceError } from "../lib/workspace-errors";
import {
  getWorkspaceDocument,
  isRuntimeTabKey,
  listWorkspaceDocuments,
  listWorkspaceHiddenRuntimeTabKeys,
  listWorkspacePaneTabSnapshots,
  listWorkspaceTabViewStateByKey,
  readWorkspaceSurfaceState,
  type WorkspaceSurfaceTabViewState,
  writeWorkspaceSurfaceState,
} from "../state/workspace-surface-state";
import {
  createWorkspacePaneId,
  createWorkspaceSplitId,
  createWorkspaceSurfaceId,
} from "./workspace-surface-ids";
import type { OpenDocumentRequest } from "./workspace-surface-requests";
import { workspaceSurfaceReducer } from "./workspace-surface-reducer";
import {
  isEditableTarget,
  isMacPlatform,
  readWorkspaceTabHotkeyAction,
  releaseWebviewFocus,
  shouldTreatWindowCloseAsTabClose,
  toWorkspaceTabHotkeyAction,
  type WorkspaceTabHotkeyAction,
} from "./workspace-surface-shortcuts";
import { type SurfaceLaunchAction, type SurfaceLaunchRequest } from "./surface-launch-actions";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";
import {
  areStringArraysEqual,
  getWorkspaceAdjacentTabKey,
  getWorkspaceTabKeyByIndex,
  orderWorkspaceTerminals,
  reconcileHiddenRuntimeTabKeys,
  resolveWorkspaceVisibleTabs,
  type RuntimeTab,
} from "./workspace-surface-tabs";
import {
  getWorkspaceLiveRuntimeTabKeys,
  getWorkspacePaneIdsWaitingForSelectedRuntimeTab,
  getWorkspaceRenderedPaneActiveTabKeys,
  getWorkspaceUnassignedLiveRuntimeTabKeys,
} from "./workspace-surface-runtime-state";

export interface WorkspaceSurfaceControllerInput {
  openDocumentRequest: OpenDocumentRequest | null;
  onOpenDocumentRequestHandled?: (requestId: string) => void;
  snapshotTerminals: TerminalRecord[];
  workspaceId: string;
}

export function useWorkspaceSurfaceController({
  openDocumentRequest,
  onOpenDocumentRequestHandled,
  snapshotTerminals,
  workspaceId,
}: WorkspaceSurfaceControllerInput) {
  const client = useQueryClient();
  const { clearTerminalResponseReady, isTerminalResponseReady, isTerminalTurnRunning } =
    useTerminalResponseReady();
  const [creatingSelection, setCreatingSelection] = useState<"shell" | HarnessProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [state, dispatch] = useReducer(
    workspaceSurfaceReducer,
    workspaceId,
    readWorkspaceSurfaceState,
  );
  const closeShortcutTriggeredAtRef = useRef(0);
  const closeShortcutHandledAtRef = useRef(0);

  const terminalSnapshot = useMemo(() => snapshotTerminals, [snapshotTerminals]);
  const terminals = useMemo(
    () =>
      orderWorkspaceTerminals(
        terminalSnapshot.filter((terminal) => terminalHasLiveSession(terminal.status)),
      ),
    [terminalSnapshot],
  );
  const runtimeTabs = useMemo<RuntimeTab[]>(
    () =>
      terminals.map((terminal) => ({
        harnessProvider: terminal.harness_provider as HarnessProvider | null,
        key: `terminal:${terminal.id}`,
        kind: "terminal",
        label: terminal.label,
        launchType: terminal.launch_type,
        running: isTerminalTurnRunning(terminal.id),
        responseReady: isTerminalResponseReady(terminal.id),
        status: terminal.status as TerminalStatus,
        terminalId: terminal.id,
      })),
    [isTerminalResponseReady, isTerminalTurnRunning, terminals],
  );
  const liveRuntimeTabKeys = useMemo(
    () => getWorkspaceLiveRuntimeTabKeys(runtimeTabs),
    [runtimeTabs],
  );
  const liveRuntimeTabKeySet = useMemo(() => new Set(liveRuntimeTabKeys), [liveRuntimeTabKeys]);
  const paneLayout = useMemo(() => inspectWorkspacePaneLayout(state.rootPane), [state.rootPane]);
  const paneSnapshots = useMemo(
    () => listWorkspacePaneTabSnapshots(state.rootPane, state.paneTabStateById),
    [state.paneTabStateById, state.rootPane],
  );
  const documents = useMemo(
    () => listWorkspaceDocuments(state.documentsByKey),
    [state.documentsByKey],
  );
  const hiddenRuntimeTabKeys = useMemo(
    () => listWorkspaceHiddenRuntimeTabKeys(state.tabStateByKey),
    [state.tabStateByKey],
  );
  const viewStateByTabKey = useMemo(
    () => listWorkspaceTabViewStateByKey(state.tabStateByKey),
    [state.tabStateByKey],
  );
  const activePaneId = state.activePaneId;
  const activePane = useMemo(
    () => requireWorkspacePane(state.rootPane, activePaneId),
    [activePaneId, state.rootPane],
  );
  const visibleTabsByPaneId = useMemo(
    () =>
      Object.fromEntries(
        paneSnapshots.map((pane) => [
          pane.id,
          resolveWorkspaceVisibleTabs(
            runtimeTabs,
            state.documentsByKey,
            pane.tabOrderKeys,
            hiddenRuntimeTabKeys,
          ),
        ]),
      ),
    [hiddenRuntimeTabKeys, paneSnapshots, runtimeTabs, state.documentsByKey],
  );
  const renderedActiveTabKeyByPaneId = useMemo(
    () => getWorkspaceRenderedPaneActiveTabKeys(paneSnapshots, visibleTabsByPaneId),
    [paneSnapshots, visibleTabsByPaneId],
  );
  const activePaneVisibleTabs = activePane ? (visibleTabsByPaneId[activePane.id] ?? []) : [];
  const activePaneVisibleTabKeys = useMemo(
    () => activePaneVisibleTabs.map((tab) => tab.key),
    [activePaneVisibleTabs],
  );
  const knownRuntimeTabKeys = useMemo(
    () => terminalSnapshot.map((terminal) => `terminal:${terminal.id}`),
    [terminalSnapshot],
  );
  const assignedPaneTabKeys = useMemo(
    () => new Set(paneSnapshots.flatMap((pane) => pane.tabOrderKeys)),
    [paneSnapshots],
  );
  const activeTabKey = activePane ? (renderedActiveTabKeyByPaneId[activePane.id] ?? null) : null;
  const activeTerminalId =
    activeTabKey && isRuntimeTabKey(activeTabKey) ? activeTabKey.slice("terminal:".length) : null;
  const paneIdsWaitingForSelectedRuntimeTab = useMemo(
    () =>
      getWorkspacePaneIdsWaitingForSelectedRuntimeTab(
        paneSnapshots,
        visibleTabsByPaneId,
        liveRuntimeTabKeySet,
      ),
    [liveRuntimeTabKeySet, paneSnapshots, visibleTabsByPaneId],
  );
  const openFileTabKeys = useMemo(
    () =>
      documents
        .filter((document) => document.kind === "file-viewer")
        .map((document) => document.key),
    [documents],
  );
  const {
    clearFileSession,
    confirmCloseFileSession,
    fileSessionsByTabKey,
    handleFileSessionStateChange,
  } = useWorkspaceFileSessions(openFileTabKeys);

  useEffect(() => {
    if (!openDocumentRequest) {
      return;
    }

    if (openDocumentRequest.kind === "file-viewer") {
      recordWorkspaceFileUsage(workspaceId, openDocumentRequest.filePath);
    }

    dispatch({
      request: openDocumentRequest,
      kind: "open-document",
    });
    onOpenDocumentRequestHandled?.(openDocumentRequest.id);
  }, [onOpenDocumentRequestHandled, openDocumentRequest, workspaceId]);

  useEffect(() => {
    writeWorkspaceSurfaceState(workspaceId, state);
  }, [state, workspaceId]);

  useEffect(() => {
    const syncDocumentVisible = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", syncDocumentVisible);

    return () => {
      document.removeEventListener("visibilitychange", syncDocumentVisible);
    };
  }, []);

  useEffect(() => {
    const nextHiddenRuntimeTabKeys = reconcileHiddenRuntimeTabKeys(
      hiddenRuntimeTabKeys,
      knownRuntimeTabKeys,
      true,
    );

    if (!areStringArraysEqual(hiddenRuntimeTabKeys, nextHiddenRuntimeTabKeys)) {
      dispatch({
        keys: nextHiddenRuntimeTabKeys,
        kind: "set-hidden-runtime-tab-keys",
      });
    }
  }, [hiddenRuntimeTabKeys, knownRuntimeTabKeys]);

  useEffect(() => {
    const unassignedRuntimeKeys = getWorkspaceUnassignedLiveRuntimeTabKeys(
      liveRuntimeTabKeys,
      assignedPaneTabKeys,
      hiddenRuntimeTabKeys,
    );
    if (unassignedRuntimeKeys.length === 0) {
      return;
    }

    for (const key of unassignedRuntimeKeys) {
      dispatch({
        key,
        kind: "show-runtime-tab",
        paneId: activePaneId,
        select: false,
      });
    }
  }, [activePaneId, assignedPaneTabKeys, hiddenRuntimeTabKeys, liveRuntimeTabKeys]);

  useEffect(() => {
    if (!activeTerminalId || !documentVisible) {
      return;
    }

    if (!isTerminalResponseReady(activeTerminalId)) {
      return;
    }

    clearTerminalResponseReady(activeTerminalId);
  }, [activeTerminalId, clearTerminalResponseReady, documentVisible, isTerminalResponseReady]);

  const handleSelectPane = useCallback((paneId: string) => {
    dispatch({ kind: "select-pane", paneId });
  }, []);

  const handleSelectTab = useCallback(
    (paneId: string, key: string) => {
      if (!paneId) {
        return;
      }

      releaseWebviewFocus();
      if (isRuntimeTabKey(key)) {
        clearTerminalResponseReady(key.slice("terminal:".length));
      }
      dispatch({ key, kind: "select-tab", paneId });
    },
    [clearTerminalResponseReady],
  );

  const handleActiveTabViewStateChange = useCallback(
    (tabKey: string, viewState: WorkspaceSurfaceTabViewState | null) => {
      dispatch({
        key: tabKey,
        kind: "set-tab-view-state",
        viewState,
      });
    },
    [],
  );

  const handleOpenFile = useCallback(
    (filePath: string) => {
      releaseWebviewFocus();
      recordWorkspaceFileUsage(workspaceId, filePath);
      dispatch({
        request: {
          filePath,
          id: createWorkspaceSurfaceId(),
          kind: "file-viewer",
        },
        kind: "open-document",
      });
    },
    [workspaceId],
  );

  const handleShowRuntimeTab = useCallback(
    (terminalId: string, paneId?: string) => {
      releaseWebviewFocus();
      clearTerminalResponseReady(terminalId);
      dispatch({ key: `terminal:${terminalId}`, kind: "show-runtime-tab", paneId, select: true });
    },
    [clearTerminalResponseReady],
  );

  const handleCreateTerminal = useCallback(
    async (input: CreateTerminalRequest, paneId?: string) => {
      if (paneId) {
        dispatch({ kind: "select-pane", paneId });
      }
      setCreatingSelection(input.launchType === "harness" ? input.harnessProvider : "shell");
      setError(null);
      releaseWebviewFocus();

      try {
        const terminal = await createTerminal({
          ...input,
          workspaceId,
        });
        client.invalidate(terminalKeys.byWorkspace(workspaceId));
        client.invalidate(terminalKeys.detail(terminal.id));
        handleShowRuntimeTab(terminal.id, paneId);
      } catch (createError) {
        setError(formatWorkspaceError(createError, "Failed to create session."));
      } finally {
        setCreatingSelection(null);
      }
    },
    [client, handleShowRuntimeTab, workspaceId],
  );

  const handleLaunchSurface = useCallback(
    (paneId: string, request: SurfaceLaunchRequest) => {
      switch (request.kind) {
        case "terminal":
          void handleCreateTerminal(request, paneId);
          break;
      }
    },
    [handleCreateTerminal],
  );

  const surfaceActions: SurfaceLaunchAction[] = useMemo(
    () => [
      {
        key: "shell",
        title: "New shell",
        icon: <ShellIcon />,
        request: { kind: "terminal", launchType: "shell" },
        loading: creatingSelection === "shell",
        disabled: creatingSelection !== null,
      },
      {
        key: "claude",
        title: "New Claude session",
        icon: <ClaudeIcon />,
        request: { kind: "terminal", launchType: "harness", harnessProvider: "claude" as const },
        loading: creatingSelection === "claude",
        disabled: creatingSelection !== null,
      },
      {
        key: "codex",
        title: "New Codex session",
        icon: <CodexIcon />,
        request: { kind: "terminal", launchType: "harness", harnessProvider: "codex" as const },
        loading: creatingSelection === "codex",
        disabled: creatingSelection !== null,
      },
    ],
    [creatingSelection],
  );

  const handleCloseRuntimeTab = useCallback(
    async (tabKey: string, terminalId: string) => {
      try {
        await detachTerminal(terminalId);
        client.invalidate(terminalKeys.byWorkspace(workspaceId));
        client.invalidate(terminalKeys.detail(terminalId));
        dispatch({
          key: tabKey,
          kind: "hide-runtime-tab",
        });
      } catch (closeError) {
        setError(String(closeError));
      }
    },
    [client, workspaceId],
  );

  const handleCloseDocumentTab = useCallback(
    (tabKey: string) => {
      const closingDocument = getWorkspaceDocument(state.documentsByKey, tabKey);
      if (
        closingDocument?.kind === "file-viewer" &&
        !confirmCloseFileSession(closingDocument.key, closingDocument.label)
      ) {
        return;
      }

      dispatch({
        key: tabKey,
        kind: "close-document",
      });
      clearFileSession(tabKey);
    },
    [clearFileSession, confirmCloseFileSession, state.documentsByKey],
  );

  const handleWorkspaceTabHotkeyAction = useCallback(
    (action: WorkspaceTabHotkeyAction) => {
      switch (action.kind) {
        case "new-tab":
          void handleCreateTerminal({ launchType: "shell" }, activePaneId);
          return;
        case "close-active-tab": {
          if (!activeTabKey) {
            return;
          }

          const activeTab = activePaneVisibleTabs.find((tab) => tab.key === activeTabKey);
          if (!activeTab) {
            return;
          }

          closeShortcutHandledAtRef.current = Date.now();
          if (activeTab.kind === "terminal") {
            void handleCloseRuntimeTab(activeTab.key, activeTab.terminalId);
            return;
          }

          handleCloseDocumentTab(activeTab.key);
          return;
        }
        case "next-tab": {
          const nextKey = getWorkspaceAdjacentTabKey(
            activePaneVisibleTabKeys,
            activeTabKey,
            "next",
          );
          if (nextKey) {
            handleSelectTab(activePaneId, nextKey);
          }
          return;
        }
        case "previous-tab": {
          const previousKey = getWorkspaceAdjacentTabKey(
            activePaneVisibleTabKeys,
            activeTabKey,
            "previous",
          );
          if (previousKey) {
            handleSelectTab(activePaneId, previousKey);
          }
          return;
        }
        case "select-tab-index": {
          const selectedKey = getWorkspaceTabKeyByIndex(activePaneVisibleTabKeys, action.index);
          if (selectedKey) {
            handleSelectTab(activePaneId, selectedKey);
          }
        }
      }
    },
    [
      activePaneId,
      activePaneVisibleTabKeys,
      activePaneVisibleTabs,
      activeTabKey,
      handleCloseDocumentTab,
      handleCloseRuntimeTab,
      handleCreateTerminal,
      handleSelectTab,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const action = readWorkspaceTabHotkeyAction(event, isMacPlatform());
      if (!action) {
        return;
      }

      if (action.kind === "close-active-tab") {
        closeShortcutTriggeredAtRef.current = Date.now();
      }
      event.preventDefault();
      handleWorkspaceTabHotkeyAction(action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleWorkspaceTabHotkeyAction]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void subscribeToNativeWorkspaceShortcutEvents((event) => {
      if (
        disposed ||
        event.source_surface_kind !== "native-terminal" ||
        event.source_surface_id !== activeTerminalId
      ) {
        return;
      }

      const action = toWorkspaceTabHotkeyAction(event);
      if (action) {
        if (action.kind === "close-active-tab") {
          closeShortcutTriggeredAtRef.current = Date.now();
        }
        handleWorkspaceTabHotkeyAction(action);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeTerminalId, handleWorkspaceTabHotkeyAction]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onCloseRequested((event) => {
        const now = Date.now();
        if (
          !activeTabKey ||
          activePaneVisibleTabs.length === 0 ||
          !shouldTreatWindowCloseAsTabClose(closeShortcutTriggeredAtRef.current, now)
        ) {
          return;
        }

        closeShortcutTriggeredAtRef.current = 0;
        event.preventDefault();
        if (shouldTreatWindowCloseAsTabClose(closeShortcutHandledAtRef.current, now)) {
          return;
        }
        handleWorkspaceTabHotkeyAction({ kind: "close-active-tab" });
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }

        unlisten = cleanup;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activePaneVisibleTabs.length, activeTabKey, handleWorkspaceTabHotkeyAction]);

  const handleClosePane = useCallback((paneId: string) => {
    dispatch({ kind: "close-pane", paneId });
  }, []);

  const handleMoveTabToPane = useCallback(
    (
      key: string,
      sourcePaneId: string,
      targetPaneId: string,
      targetKey?: string,
      placement?: "before" | "after",
      splitDirection?: "column" | "row",
      splitPlacement?: "after" | "before",
      splitRatio?: number,
    ) => {
      if (splitDirection && splitPlacement) {
        const newPaneId = createWorkspacePaneId();
        dispatch({
          direction: splitDirection,
          kind: "split-pane",
          newPaneId,
          paneId: targetPaneId,
          placement: splitPlacement,
          ratio: splitRatio,
          splitId: createWorkspaceSplitId(),
        });
        dispatch({
          emptySourcePanePolicy: "preserve",
          key,
          kind: "move-tab-to-pane",
          sourcePaneId,
          targetPaneId: newPaneId,
        });
        return;
      }

      dispatch({
        emptySourcePanePolicy: "close",
        key,
        kind: "move-tab-to-pane",
        placement,
        sourcePaneId,
        targetKey,
        targetPaneId,
      });
    },
    [],
  );

  const handleRenameRuntimeTab = useCallback((terminalId: string, label: string) => {
    return renameTerminal(terminalId, label);
  }, []);

  const handleReconcilePaneVisibleTabOrder = useCallback((paneId: string, keys: string[]) => {
    dispatch({ keys, kind: "reconcile-pane-visible-tab-order", paneId });
  }, []);

  const handleSetSplitRatio = useCallback((splitId: string, ratio: number) => {
    dispatch({ kind: "set-split-ratio", ratio, splitId });
  }, []);

  const handleSplitPane = useCallback((paneId: string, direction: "column" | "row") => {
    dispatch({
      direction,
      kind: "split-pane",
      newPaneId: createWorkspacePaneId(),
      paneId,
      placement: "after",
      splitId: createWorkspaceSplitId(),
    });
  }, []);

  return {
    activePaneId,
    creatingSelection,
    documents,
    error,
    fileSessionsByTabKey,
    handleActiveTabViewStateChange,
    handleCloseDocumentTab,
    handleClosePane,
    handleCloseRuntimeTab,
    handleCreateTerminal,
    handleFileSessionStateChange,
    handleLaunchSurface,
    handleMoveTabToPane,
    handleOpenFile,
    handleRenameRuntimeTab,
    handleSelectPane,
    handleSelectTab,
    handleReconcilePaneVisibleTabOrder,
    handleSetSplitRatio,
    handleSplitPane,
    paneCount: paneLayout.paneCount,
    renderedActiveTabKeyByPaneId,
    rootPane: state.rootPane,
    surfaceActions,
    terminals,
    viewStateByTabKey,
    visibleTabsByPaneId,
    paneIdsWaitingForSelectedRuntimeTab,
    workspaceId,
  };
}

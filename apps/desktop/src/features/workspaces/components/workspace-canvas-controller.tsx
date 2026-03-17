import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQueryClient } from "../../../query";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { recordWorkspaceFileUsage } from "../../files/lib/workspace-file-usage";
import { useWorkspaceFileSessions } from "../../files/state/workspace-file-sessions";
import {
  createTerminal,
  detachTerminal,
  interruptTerminal,
  renameTerminal,
  terminalHasLiveSession,
  type CreateTerminalRequest,
  type HarnessProvider,
} from "../../terminals/api";
import { terminalKeys } from "../../terminals/hooks";
import { hideNativeTerminalSurface } from "../../terminals/native-surface-api";
import { useTerminalResponseReady } from "../../terminals/state/terminal-response-ready-provider";
import { subscribeToNativeWorkspaceShortcutEvents } from "../native-shortcuts-api";
import {
  getAdjacentPaneId,
  inspectWorkspacePaneLayout,
  requireWorkspacePane,
} from "../lib/workspace-pane-layout";
import { formatWorkspaceError } from "../lib/workspace-errors";
import { consumePendingTerminalFocus } from "../../notifications/lib/notification-navigation";
import {
  getWorkspaceDocument,
  isTerminalTabKey,
  listWorkspaceDocuments,
  listWorkspaceHiddenTerminalTabKeys,
  listWorkspacePaneTabSnapshots,
  listWorkspaceTabViewStateByKey,
  readWorkspaceCanvasState,
  type WorkspaceCanvasTabViewState,
  writeWorkspaceCanvasState,
} from "../state/workspace-canvas-state";
import {
  createWorkspacePaneId,
  createWorkspaceSplitId,
  createWorkspaceCanvasId,
} from "./workspace-canvas-ids";
import type { OpenDocumentRequest } from "./workspace-canvas-requests";
import { workspaceCanvasReducer } from "./workspace-canvas-reducer";
import {
  releaseWebviewFocus,
  resolveWorkspaceCloseShortcutTarget,
  shouldTreatWindowCloseAsTabClose,
  toWorkspaceTabHotkeyAction,
  type WorkspaceTabHotkeyAction,
} from "./workspace-canvas-shortcuts";
import { useSettings } from "../../settings/state/app-settings-provider";
import { buildHarnessLaunchConfig } from "../../settings/state/harness-settings";
import { type SurfaceLaunchAction, type SurfaceLaunchRequest } from "./surface-launch-actions";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";
import {
  areStringArraysEqual,
  getWorkspaceAdjacentTabKey,
  orderWorkspaceTerminals,
  reconcileHiddenTerminalTabKeys,
  resolveWorkspaceVisibleTabs,
  type TerminalTab,
} from "./workspace-canvas-tabs";
import {
  getWorkspaceInactiveTerminalIds,
  getWorkspaceLiveTerminalTabKeys,
  getWorkspacePaneIdsWaitingForSelectedTerminalTab,
  getWorkspaceRenderedPaneActiveTabKeys,
  getWorkspaceUnassignedLiveTerminalTabKeys,
} from "./workspace-canvas-terminal-state";
import { closeWorkspacePaneTabs } from "./workspace-pane-close";

export interface WorkspaceCanvasControllerInput {
  openDocumentRequest: OpenDocumentRequest | null;
  onCloseWorkspaceTab?: () => void;
  onOpenDocumentRequestHandled?: (requestId: string) => void;
  snapshotTerminals: TerminalRecord[];
  workspaceId: string;
}

export function useWorkspaceCanvasController({
  openDocumentRequest,
  onCloseWorkspaceTab,
  onOpenDocumentRequestHandled,
  snapshotTerminals,
  workspaceId,
}: WorkspaceCanvasControllerInput) {
  const client = useQueryClient();
  const { defaultNewTabLaunch, dimInactivePanes, harnesses, inactivePaneOpacity } = useSettings();
  const { clearTerminalResponseReady, isTerminalResponseReady, isTerminalTurnRunning } =
    useTerminalResponseReady();
  const [creatingSelection, setCreatingSelection] = useState<"shell" | HarnessProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [zoomedTabKey, setZoomedTabKey] = useState<string | null>(null);
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [state, dispatch] = useReducer(
    workspaceCanvasReducer,
    workspaceId,
    readWorkspaceCanvasState,
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
  const terminalTabs = useMemo<TerminalTab[]>(
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
  const liveTerminalTabKeys = useMemo(
    () => getWorkspaceLiveTerminalTabKeys(terminalTabs),
    [terminalTabs],
  );
  const liveTerminalTabKeySet = useMemo(() => new Set(liveTerminalTabKeys), [liveTerminalTabKeys]);
  const paneLayout = useMemo(() => inspectWorkspacePaneLayout(state.rootPane), [state.rootPane]);
  const paneSnapshots = useMemo(
    () => listWorkspacePaneTabSnapshots(state.rootPane, state.paneTabStateById),
    [state.paneTabStateById, state.rootPane],
  );
  const documents = useMemo(
    () => listWorkspaceDocuments(state.documentsByKey),
    [state.documentsByKey],
  );
  const hiddenTerminalTabKeys = useMemo(
    () => listWorkspaceHiddenTerminalTabKeys(state.tabStateByKey),
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
            terminalTabs,
            state.documentsByKey,
            pane.tabOrderKeys,
            hiddenTerminalTabKeys,
          ),
        ]),
      ),
    [hiddenTerminalTabKeys, paneSnapshots, terminalTabs, state.documentsByKey],
  );
  const renderedActiveTabKeyByPaneId = useMemo(
    () => getWorkspaceRenderedPaneActiveTabKeys(paneSnapshots, visibleTabsByPaneId),
    [paneSnapshots, visibleTabsByPaneId],
  );
  const inactiveTerminalIds = useMemo(
    () => getWorkspaceInactiveTerminalIds(liveTerminalTabKeys, renderedActiveTabKeyByPaneId),
    [liveTerminalTabKeys, renderedActiveTabKeyByPaneId],
  );
  const activePaneVisibleTabs = activePane ? (visibleTabsByPaneId[activePane.id] ?? []) : [];
  const activePaneVisibleTabKeys = useMemo(
    () => activePaneVisibleTabs.map((tab) => tab.key),
    [activePaneVisibleTabs],
  );
  const knownTerminalTabKeys = useMemo(
    () => terminalSnapshot.map((terminal) => `terminal:${terminal.id}`),
    [terminalSnapshot],
  );
  const assignedPaneTabKeys = useMemo(
    () => new Set(paneSnapshots.flatMap((pane) => pane.tabOrderKeys)),
    [paneSnapshots],
  );
  const activeTabKey = activePane ? (renderedActiveTabKeyByPaneId[activePane.id] ?? null) : null;
  const activeTerminalId =
    activeTabKey && isTerminalTabKey(activeTabKey) ? activeTabKey.slice("terminal:".length) : null;
  const renderedTerminalIdSetRef = useRef<Set<string>>(new Set());
  const paneIdsWaitingForSelectedTerminalTab = useMemo(
    () =>
      getWorkspacePaneIdsWaitingForSelectedTerminalTab(
        paneSnapshots,
        visibleTabsByPaneId,
        liveTerminalTabKeySet,
      ),
    [liveTerminalTabKeySet, paneSnapshots, visibleTabsByPaneId],
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
    writeWorkspaceCanvasState(workspaceId, state);
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
    const nextHiddenTerminalTabKeys = reconcileHiddenTerminalTabKeys(
      hiddenTerminalTabKeys,
      knownTerminalTabKeys,
      true,
    );

    if (!areStringArraysEqual(hiddenTerminalTabKeys, nextHiddenTerminalTabKeys)) {
      dispatch({
        keys: nextHiddenTerminalTabKeys,
        kind: "set-hidden-terminal-tab-keys",
      });
    }
  }, [hiddenTerminalTabKeys, knownTerminalTabKeys]);

  useEffect(() => {
    const unassignedTerminalKeys = getWorkspaceUnassignedLiveTerminalTabKeys(
      liveTerminalTabKeys,
      assignedPaneTabKeys,
      hiddenTerminalTabKeys,
    );
    if (unassignedTerminalKeys.length === 0) {
      return;
    }

    for (const key of unassignedTerminalKeys) {
      dispatch({
        key,
        kind: "show-terminal-tab",
        paneId: activePaneId,
        select: false,
      });
    }
  }, [activePaneId, assignedPaneTabKeys, hiddenTerminalTabKeys, liveTerminalTabKeys]);

  useEffect(() => {
    if (!activeTerminalId || !documentVisible) {
      return;
    }

    if (!isTerminalResponseReady(activeTerminalId)) {
      return;
    }

    clearTerminalResponseReady(activeTerminalId);
  }, [activeTerminalId, clearTerminalResponseReady, documentVisible, isTerminalResponseReady]);

  useEffect(() => {
    renderedTerminalIdSetRef.current = new Set(
      Object.values(renderedActiveTabKeyByPaneId).flatMap((key) =>
        key && isTerminalTabKey(key) ? [key.slice("terminal:".length)] : [],
      ),
    );
  }, [renderedActiveTabKeyByPaneId]);

  useEffect(() => {
    if (inactiveTerminalIds.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      for (const terminalId of inactiveTerminalIds) {
        if (renderedTerminalIdSetRef.current.has(terminalId)) {
          continue;
        }

        void hideNativeTerminalSurface(terminalId).catch((nextError) => {
          console.error("Failed to hide inactive native terminal surface:", nextError);
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [inactiveTerminalIds]);

  const handleSelectPane = useCallback((paneId: string) => {
    dispatch({ kind: "select-pane", paneId });
  }, []);

  const handleSelectTab = useCallback(
    (paneId: string, key: string) => {
      if (!paneId) {
        return;
      }

      releaseWebviewFocus();
      if (isTerminalTabKey(key)) {
        clearTerminalResponseReady(key.slice("terminal:".length));
      }
      dispatch({ key, kind: "select-tab", paneId });
    },
    [clearTerminalResponseReady],
  );

  const handleActiveTabViewStateChange = useCallback(
    (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => {
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
          id: createWorkspaceCanvasId(),
          kind: "file-viewer",
        },
        kind: "open-document",
      });
    },
    [workspaceId],
  );

  const handleShowTerminalTab = useCallback(
    (terminalId: string, paneId?: string) => {
      releaseWebviewFocus();
      clearTerminalResponseReady(terminalId);
      dispatch({ key: `terminal:${terminalId}`, kind: "show-terminal-tab", paneId, select: true });
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
        const terminal =
          input.launchType === "harness"
            ? await createTerminal({
                ...input,
                harnessLaunchConfig: buildHarnessLaunchConfig(input.harnessProvider, harnesses),
                workspaceId,
              })
            : await createTerminal({
                ...input,
                workspaceId,
              });
        client.invalidate(terminalKeys.byWorkspace(workspaceId));
        client.invalidate(terminalKeys.detail(terminal.id));
        handleShowTerminalTab(terminal.id, paneId);
      } catch (createError) {
        setError(formatWorkspaceError(createError, "Failed to create session."));
      } finally {
        setCreatingSelection(null);
      }
    },
    [client, handleShowTerminalTab, harnesses, workspaceId],
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
        title: "Shell",
        icon: <ShellIcon />,
        request: { kind: "terminal", launchType: "shell" },
        loading: creatingSelection === "shell",
        disabled: creatingSelection !== null,
      },
      {
        key: "claude",
        title: "Claude",
        icon: <ClaudeIcon />,
        request: { kind: "terminal", launchType: "harness", harnessProvider: "claude" as const },
        loading: creatingSelection === "claude",
        disabled: creatingSelection !== null,
      },
      {
        key: "codex",
        title: "Codex",
        icon: <CodexIcon />,
        request: { kind: "terminal", launchType: "harness", harnessProvider: "codex" as const },
        loading: creatingSelection === "codex",
        disabled: creatingSelection !== null,
      },
    ],
    [creatingSelection],
  );

  const closeTerminalTab = useCallback(
    async (tabKey: string, terminalId: string) => {
      try {
        await detachTerminal(terminalId);
        client.invalidate(terminalKeys.byWorkspace(workspaceId));
        client.invalidate(terminalKeys.detail(terminalId));
        dispatch({
          key: tabKey,
          kind: "hide-terminal-tab",
        });
        return true;
      } catch (closeError) {
        setError(formatWorkspaceError(closeError, "Failed to close session."));
        return false;
      }
    },
    [client, workspaceId],
  );

  const closeDocumentTab = useCallback(
    (tabKey: string): boolean => {
      const closingDocument = getWorkspaceDocument(state.documentsByKey, tabKey);
      if (
        closingDocument?.kind === "file-viewer" &&
        !confirmCloseFileSession(closingDocument.key, closingDocument.label)
      ) {
        return false;
      }

      dispatch({
        key: tabKey,
        kind: "close-document",
      });
      clearFileSession(tabKey);
      return true;
    },
    [clearFileSession, confirmCloseFileSession, state.documentsByKey],
  );

  const collapseWorkspacePane = useCallback((paneId: string) => {
    dispatch({ kind: "collapse-pane", paneId });
  }, []);

  const closeWorkspacePane = useCallback(
    async (paneId: string) => {
      const didClosePaneTabs = await closeWorkspacePaneTabs(visibleTabsByPaneId[paneId] ?? [], {
        collapseEmptyPane: () => {},
        closeDocumentTab,
        closeTerminalTab,
      });
      if (didClosePaneTabs) {
        collapseWorkspacePane(paneId);
      }
    },
    [closeDocumentTab, closeTerminalTab, collapseWorkspacePane, visibleTabsByPaneId],
  );

  const handleCloseTerminalTab = useCallback(
    async (tabKey: string, terminalId: string) => {
      await closeTerminalTab(tabKey, terminalId);
    },
    [closeTerminalTab],
  );

  const handleCloseDocumentTab = useCallback(
    (tabKey: string) => {
      closeDocumentTab(tabKey);
    },
    [closeDocumentTab],
  );

  const handleWorkspaceTabHotkeyAction = useCallback(
    (action: WorkspaceTabHotkeyAction): boolean => {
      switch (action.kind) {
        case "new-tab": {
          const request: CreateTerminalRequest =
            defaultNewTabLaunch === "shell"
              ? { launchType: "shell" }
              : { launchType: "harness", harnessProvider: defaultNewTabLaunch };
          void handleCreateTerminal(request, activePaneId);
          return true;
        }
        case "close-active-tab": {
          const closeTarget = resolveWorkspaceCloseShortcutTarget(
            paneLayout.paneCount,
            activePaneVisibleTabs.length,
          );
          if (closeTarget === "close-pane") {
            closeShortcutHandledAtRef.current = Date.now();
            void closeWorkspacePane(activePaneId);
            return true;
          }

          if (closeTarget === "close-project-tab" && onCloseWorkspaceTab) {
            closeShortcutHandledAtRef.current = Date.now();
            onCloseWorkspaceTab();
            return true;
          }

          if (!activeTabKey) {
            return true;
          }

          const activeTab = activePaneVisibleTabs.find((tab) => tab.key === activeTabKey);
          if (!activeTab) {
            return true;
          }

          closeShortcutHandledAtRef.current = Date.now();
          if (activeTab.kind === "terminal") {
            void handleCloseTerminalTab(activeTab.key, activeTab.terminalId);
            return true;
          }

          handleCloseDocumentTab(activeTab.key);
          return true;
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
          return true;
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
          return true;
        }
        case "reopen-closed-tab": {
          dispatch({ kind: "reopen-closed-tab" });
          return true;
        }
      }
    },
    [
      activePaneId,
      activePaneVisibleTabKeys,
      activePaneVisibleTabs,
      activeTabKey,
      closeWorkspacePane,
      defaultNewTabLaunch,
      handleCloseDocumentTab,
      handleCloseTerminalTab,
      handleCreateTerminal,
      onCloseWorkspaceTab,
      paneLayout.paneCount,
      handleSelectTab,
    ],
  );

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "new-tab" }),
    id: "workspace.new-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    handler: () => {
      closeShortcutTriggeredAtRef.current = Date.now();
      return handleWorkspaceTabHotkeyAction({ kind: "close-active-tab" });
    },
    id: "workspace.close-active-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "reopen-closed-tab" }),
    id: "workspace.reopen-closed-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "previous-tab" }),
    id: "workspace.previous-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "next-tab" }),
    id: "workspace.next-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    handler: (match) => {
      if (!match.direction) {
        return false;
      }
      const adjacentId = getAdjacentPaneId(state.rootPane, activePaneId, match.direction);
      if (adjacentId) {
        handleSelectPane(adjacentId);
      }
      return true;
    },
    id: "workspace.focus-pane",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

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

  useEffect(() => {
    const handleFocusTerminal = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId: string; terminalId: string }>).detail;
      if (detail.workspaceId !== workspaceId) {
        return;
      }

      handleShowTerminalTab(detail.terminalId);
    };

    window.addEventListener("lifecycle:focus-terminal", handleFocusTerminal);
    return () => window.removeEventListener("lifecycle:focus-terminal", handleFocusTerminal);
  }, [handleShowTerminalTab, workspaceId]);

  // Consume pending terminal focus from notification clicks
  useEffect(() => {
    const terminalId = consumePendingTerminalFocus(workspaceId);
    if (terminalId) {
      handleShowTerminalTab(terminalId);
    }
  }, [handleShowTerminalTab, workspaceId]);

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
          emptySourcePanePolicy: "close",
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

  const handleRenameTerminalTab = useCallback((terminalId: string, label: string) => {
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

  const handleToggleZoom = useCallback(() => {
    setZoomedTabKey((current) => {
      if (current !== null) {
        return null;
      }
      return activeTabKey;
    });
  }, [activeTabKey]);

  const handleUnzoom = useCallback(() => {
    setZoomedTabKey(null);
  }, []);

  // Auto-clear zoom when zoomed tab no longer exists in any pane
  useEffect(() => {
    if (zoomedTabKey === null) {
      return;
    }

    const allVisibleTabKeys = new Set(
      Object.values(visibleTabsByPaneId).flatMap((tabs) => tabs.map((tab) => tab.key)),
    );

    if (!allVisibleTabKeys.has(zoomedTabKey)) {
      setZoomedTabKey(null);
    }
  }, [visibleTabsByPaneId, zoomedTabKey]);

  useShortcutRegistration({
    handler: () => {
      handleToggleZoom();
      return true;
    },
    id: "workspace.toggle-zoom",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  // Escape to unzoom
  useEffect(() => {
    if (zoomedTabKey === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        handleUnzoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUnzoom, zoomedTabKey]);

  // Escape to interrupt running harness turn
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (zoomedTabKey !== null) {
        return; // Let unzoom handler take priority
      }
      if (!activeTerminalId || !isTerminalTurnRunning(activeTerminalId)) {
        return;
      }
      event.preventDefault();
      void interruptTerminal(activeTerminalId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTerminalId, isTerminalTurnRunning, zoomedTabKey]);

  return {
    activePaneId,
    creatingSelection,
    dimInactivePanes,
    documents,
    error,
    fileSessionsByTabKey,
    handleActiveTabViewStateChange,
    handleCloseDocumentTab,
    handleCloseTerminalTab,
    handleCreateTerminal,
    handleFileSessionStateChange,
    handleLaunchSurface,
    handleMoveTabToPane,
    handleOpenFile,
    handleRenameTerminalTab,
    handleSelectPane,
    handleSelectTab,
    handleReconcilePaneVisibleTabOrder,
    handleSetSplitRatio,
    handleSplitPane,
    handleToggleZoom,
    inactivePaneOpacity,
    paneCount: paneLayout.paneCount,
    renderedActiveTabKeyByPaneId,
    rootPane: state.rootPane,
    surfaceActions,
    terminals,
    viewStateByTabKey,
    visibleTabsByPaneId,
    paneIdsWaitingForSelectedTerminalTab,
    workspaceId,
    zoomedTabKey,
  };
}

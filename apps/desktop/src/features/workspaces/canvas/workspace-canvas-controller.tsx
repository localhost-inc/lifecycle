import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAgentStatusIndex } from "@lifecycle/agents/react";
import type { FileViewerSessionState } from "@/features/explorer/lib/file-session";
import { recordWorkspaceExplorerUsage } from "@/features/explorer/lib/workspace-explorer-usage";
import { useWorkspaceFileSessions } from "@/features/explorer/state/workspace-file-sessions";
import {
  inspectWorkspacePaneLayout,
  requireWorkspacePane,
} from "@/features/workspaces/lib/workspace-pane-layout";
import {
  createWorkspaceCanvasId,
  createWorkspacePaneId,
  createWorkspaceSplitId,
} from "@/features/workspaces/canvas/workspace-canvas-ids";
import type {
  WorkspacePaneModel,
  WorkspacePaneTabModel,
  WorkspacePaneTreeActions,
  WorkspacePaneTreeModel,
} from "@/features/workspaces/canvas/workspace-pane-models";
import { closeWorkspacePaneTabs } from "@/features/workspaces/canvas/panes/workspace-pane-close";
import {
  createAgentSurfaceLaunchRequest,
  createFileViewerOpenInput,
  type OpenSurfaceRequest,
  type SurfaceLaunchRequest,
} from "@/features/workspaces/canvas/workspace-canvas-requests";
import { workspaceCanvasReducer } from "@/features/workspaces/canvas/workspace-canvas-reducer";
import { releaseWebviewFocus } from "@/features/workspaces/canvas/workspace-canvas-shortcuts";
import {
  resolveWorkspaceVisibleTabs,
  type WorkspaceCanvasTab,
} from "@/features/workspaces/canvas/workspace-canvas-tabs";
import { useWorkspaceCanvasKeyboard } from "@/features/workspaces/canvas/workspace-canvas-keyboard";
import { useWorkspaceCanvasPersistence } from "@/features/workspaces/canvas/workspace-canvas-persistence";
import { useWorkspaceCanvasZoom } from "@/features/workspaces/canvas/workspace-canvas-zoom";
import { useSettings } from "@/features/settings/state/settings-context";
import {
  buildWorkspaceSurfaceTabPresentation,
  launchWorkspaceSurface,
  listWorkspaceSurfaceLaunchActions,
  normalizeWorkspaceSurfaceTab,
  resolveWorkspacePaneActiveSurfaceModel,
  resolveWorkspaceSurfaceModelForTab,
  resolveWorkspaceSurfaceTabStatus,
} from "@/features/workspaces/surfaces/workspace-surface-registry";
import {
  getWorkspaceTab,
  isAgentTab,
  listWorkspaceTabs,
  listWorkspacePaneTabSnapshots,
  listWorkspaceTabViewStateByKey,
  readWorkspaceCanvasState,
  type WorkspaceCanvasTabsByKey,
  type WorkspaceCanvasTabViewState,
} from "@/features/workspaces/state/workspace-canvas-state";
import { useAgentOrchestrator, useAgentSessions } from "@/store";

export interface WorkspaceCanvasControllerInput {
  openTabRequest: OpenSurfaceRequest | null;
  onCloseTab?: () => void;
  onOpenTabRequestHandled?: (requestId: string) => void;
  workspaceId: string;
}

export function shouldAutoCreateDefaultWorkspaceTab(input: { tabCount: number }): boolean {
  return input.tabCount === 0;
}

function createWorkspacePaneTabModels(input: {
  fileSessionsByTabKey: Record<string, FileViewerSessionState>;
  isAgentSessionResponseReady: (sessionId: string) => boolean;
  isAgentSessionRunning: (sessionId: string) => boolean;
  visibleTabs: readonly WorkspaceCanvasTab[];
}): WorkspacePaneTabModel[] {
  return input.visibleTabs.map((tab) => {
    const status = resolveWorkspaceSurfaceTabStatus(tab, {
      fileSessionsByTabKey: input.fileSessionsByTabKey,
      isAgentSessionResponseReady: input.isAgentSessionResponseReady,
      isAgentSessionRunning: input.isAgentSessionRunning,
    });
    const presentation = buildWorkspaceSurfaceTabPresentation(tab, status);

    return {
      isDirty: Boolean(status.isDirty),
      isRunning: Boolean(status.isRunning),
      key: tab.key,
      label: tab.label,
      leading: presentation.leading,
      needsAttention: Boolean(status.needsAttention),
      tab,
      title: presentation.title,
    };
  });
}

export function useWorkspaceCanvasController({
  openTabRequest,
  onCloseTab,
  onOpenTabRequestHandled,
  workspaceId,
}: WorkspaceCanvasControllerInput) {
  const agentOrchestrator = useAgentOrchestrator();
  const agentSessions = useAgentSessions(workspaceId);
  const { defaultNewTabLaunch, dimInactivePanes, inactivePaneOpacity } = useSettings();
  const { clearAgentSessionResponseReady, isAgentSessionResponseReady, isAgentSessionRunning } =
    useAgentStatusIndex();
  const [pendingLaunchActionKey, setPendingLaunchActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [state, dispatch] = useReducer(
    workspaceCanvasReducer,
    workspaceId,
    readWorkspaceCanvasState,
  );
  const paneLayout = useMemo(() => inspectWorkspacePaneLayout(state.rootPane), [state.rootPane]);
  const paneSnapshots = useMemo(
    () => listWorkspacePaneTabSnapshots(state.rootPane, state.paneTabStateById),
    [state.paneTabStateById, state.rootPane],
  );
  const agentSessionTitleBySessionId = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of agentSessions) {
      if (session.title?.trim()) {
        map.set(session.id, session.title.trim());
      }
    }
    return map;
  }, [agentSessions]);
  const tabs = useMemo(
    () =>
      listWorkspaceTabs(state.tabsByKey).map((tab) =>
        normalizeWorkspaceSurfaceTab(tab, {
          agentSessionTitleBySessionId,
        }),
      ),
    [agentSessionTitleBySessionId, state.tabsByKey],
  );
  const tabsByKey = useMemo<WorkspaceCanvasTabsByKey>(
    () => Object.fromEntries(tabs.map((tab) => [tab.key, tab])),
    [tabs],
  );
  const viewStateByTabKey = useMemo(
    () => listWorkspaceTabViewStateByKey(state.tabStateByKey),
    [state.tabStateByKey],
  );
  const activePane = useMemo(
    () => requireWorkspacePane(state.rootPane, state.activePaneId),
    [state.activePaneId, state.rootPane],
  );
  const visibleTabsByPaneId = useMemo(
    () =>
      Object.fromEntries(
        paneSnapshots.map((pane) => [
          pane.id,
          resolveWorkspaceVisibleTabs(tabsByKey, pane.tabOrderKeys),
        ]),
      ),
    [paneSnapshots, tabsByKey],
  );
  const renderedActiveTabKeyByPaneId = useMemo(
    () =>
      Object.fromEntries(
        paneSnapshots.map((pane) => {
          const visibleTabs = visibleTabsByPaneId[pane.id] ?? [];
          const activeTabKey = pane.activeTabKey;
          const activeTabVisible =
            activeTabKey !== null && visibleTabs.some((tab) => tab.key === activeTabKey);

          return [pane.id, activeTabVisible ? activeTabKey : (visibleTabs[0]?.key ?? null)];
        }),
      ),
    [paneSnapshots, visibleTabsByPaneId],
  );
  const activePaneVisibleTabs = visibleTabsByPaneId[activePane.id] ?? [];
  const activePaneVisibleTabKeys = useMemo(
    () => activePaneVisibleTabs.map((tab) => tab.key),
    [activePaneVisibleTabs],
  );
  const activeTabKey = renderedActiveTabKeyByPaneId[activePane.id] ?? null;
  const activeAgentSessionId = useMemo(() => {
    if (!activeTabKey) {
      return null;
    }

    const activeTab = getWorkspaceTab(tabsByKey, activeTabKey);
    return activeTab && isAgentTab(activeTab) ? activeTab.agentSessionId : null;
  }, [activeTabKey, tabsByKey]);
  const openFileTabKeys = useMemo(
    () => tabs.filter((tab) => tab.kind === "file-viewer").map((tab) => tab.key),
    [tabs],
  );
  const {
    clearFileSession,
    confirmCloseFileSession,
    fileSessionsByTabKey,
    handleFileSessionStateChange,
  } = useWorkspaceFileSessions(openFileTabKeys);
  const panesById = useMemo<Record<string, WorkspacePaneModel>>(
    () =>
      Object.fromEntries(
        paneSnapshots.map((pane) => {
          const visibleTabs = visibleTabsByPaneId[pane.id] ?? [];
          const paneActiveTabKey = renderedActiveTabKeyByPaneId[pane.id] ?? null;
          const surfaceContext = {
            fileSessionsByTabKey,
            viewStateByTabKey,
            workspaceId,
          };

          return [
            pane.id,
            {
              activeSurface: resolveWorkspacePaneActiveSurfaceModel({
                activeTabKey: paneActiveTabKey,
                fileSessionsByTabKey,
                pendingLaunchActionKey,
                viewStateByTabKey,
                visibleTabs,
                workspaceId,
              }),
              id: pane.id,
              isActive: pane.id === state.activePaneId,
              tabBar: {
                activeTabKey: paneActiveTabKey,
                dragPreview: null,
                paneId: pane.id,
                tabs: createWorkspacePaneTabModels({
                  fileSessionsByTabKey,
                  isAgentSessionResponseReady,
                  isAgentSessionRunning,
                  visibleTabs,
                }),
              },
              tabSurfaces: visibleTabs.map((tab) => ({
                key: tab.key,
                surface: resolveWorkspaceSurfaceModelForTab(tab, surfaceContext),
              })),
            } satisfies WorkspacePaneModel,
          ];
        }),
      ),
    [
      fileSessionsByTabKey,
      isAgentSessionResponseReady,
      isAgentSessionRunning,
      paneSnapshots,
      pendingLaunchActionKey,
      renderedActiveTabKeyByPaneId,
      state.activePaneId,
      viewStateByTabKey,
      visibleTabsByPaneId,
      workspaceId,
    ],
  );

  // --- External tab request handling ---

  useEffect(() => {
    if (!openTabRequest) {
      return;
    }

    if (openTabRequest.surface === "file-viewer") {
      recordWorkspaceExplorerUsage(workspaceId, openTabRequest.options.filePath);
    }

    dispatch({ kind: "open-tab", request: openTabRequest });
    onOpenTabRequestHandled?.(openTabRequest.id);
  }, [onOpenTabRequestHandled, openTabRequest, workspaceId]);

  // --- Persistence (debounced write + beforeunload) ---

  useWorkspaceCanvasPersistence(workspaceId, state);

  // --- Page visibility + agent response-ready clearing ---

  useEffect(() => {
    const syncPageVisibility = () => {
      setPageVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", syncPageVisibility);
    return () => document.removeEventListener("visibilitychange", syncPageVisibility);
  }, []);

  useEffect(() => {
    if (!activeAgentSessionId || !pageVisible) {
      return;
    }

    if (!isAgentSessionResponseReady(activeAgentSessionId)) {
      return;
    }

    clearAgentSessionResponseReady(activeAgentSessionId);
  }, [
    activeAgentSessionId,
    clearAgentSessionResponseReady,
    pageVisible,
    isAgentSessionResponseReady,
  ]);

  // --- Core action handlers ---

  const handleSelectPane = useCallback((paneId: string) => {
    dispatch({ kind: "select-pane", paneId });
  }, []);

  const handleSelectTab = useCallback(
    (paneId: string, key: string) => {
      releaseWebviewFocus();
      const tab = getWorkspaceTab(tabsByKey, key);
      if (tab && isAgentTab(tab)) {
        clearAgentSessionResponseReady(tab.agentSessionId);
      }
      dispatch({ key, kind: "select-tab", paneId });
    },
    [clearAgentSessionResponseReady, tabsByKey],
  );

  const handleActiveTabViewStateChange = useCallback(
    (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => {
      dispatch({ key: tabKey, kind: "set-tab-view-state", viewState });
    },
    [],
  );

  const handleOpenFile = useCallback(
    (filePath: string) => {
      releaseWebviewFocus();
      recordWorkspaceExplorerUsage(workspaceId, filePath);
      dispatch({
        kind: "open-tab",
        request: { ...createFileViewerOpenInput(filePath), id: createWorkspaceCanvasId() },
      });
    },
    [workspaceId],
  );

  const handleLaunchSurface = useCallback(
    (paneId: string, request: SurfaceLaunchRequest) => {
      dispatch({ kind: "select-pane", paneId });
      void launchWorkspaceSurface(request, {
        agentOrchestrator,
        openSurface: (input) => {
          dispatch({
            kind: "open-tab",
            request: { ...input, id: crypto.randomUUID() },
          });
        },
        setLaunchError: setError,
        setPendingLaunchActionKey,
        workspaceId,
      });
    },
    [agentOrchestrator, workspaceId],
  );

  // --- Auto-create default tab ---

  const didAutoCreateDefaultTabRef = useRef(false);
  useEffect(() => {
    if (didAutoCreateDefaultTabRef.current) {
      return;
    }

    if (!shouldAutoCreateDefaultWorkspaceTab({ tabCount: tabs.length })) {
      if (tabs.length > 0) {
        didAutoCreateDefaultTabRef.current = true;
      }
      return;
    }

    didAutoCreateDefaultTabRef.current = true;
    handleLaunchSurface(state.activePaneId, createAgentSurfaceLaunchRequest(defaultNewTabLaunch));
  }, [defaultNewTabLaunch, handleLaunchSurface, state.activePaneId, tabs.length]);

  const surfaceActions = useMemo(
    () =>
      listWorkspaceSurfaceLaunchActions({
        pendingLaunchActionKey,
      }),
    [pendingLaunchActionKey],
  );

  // --- Tab close with confirmation ---

  const closeTab = useCallback(
    (tabKey: string): boolean => {
      const closingTab = getWorkspaceTab(tabsByKey, tabKey);
      if (
        closingTab?.kind === "file-viewer" &&
        !confirmCloseFileSession(closingTab.key, closingTab.label)
      ) {
        return false;
      }

      if (
        closingTab &&
        isAgentTab(closingTab) &&
        isAgentSessionRunning(closingTab.agentSessionId) &&
        !window.confirm("This agent is still running. Close the tab anyway?")
      ) {
        return false;
      }

      dispatch({ key: tabKey, kind: "close-tab" });
      clearFileSession(tabKey);
      return true;
    },
    [clearFileSession, confirmCloseFileSession, isAgentSessionRunning, tabsByKey],
  );

  const collapseWorkspacePane = useCallback((paneId: string) => {
    dispatch({ kind: "collapse-pane", paneId });
  }, []);

  const closeWorkspacePane = useCallback(
    async (paneId: string) => {
      const didClosePaneTabs = await closeWorkspacePaneTabs(visibleTabsByPaneId[paneId] ?? [], {
        collapseEmptyPane: () => {},
        closeTab,
      });

      if (didClosePaneTabs) {
        collapseWorkspacePane(paneId);
      }
    },
    [closeTab, collapseWorkspacePane, visibleTabsByPaneId],
  );

  // --- Keyboard shortcuts (extracted hook) ---

  useWorkspaceCanvasKeyboard({
    activePaneId: state.activePaneId,
    activePaneVisibleTabCount: activePaneVisibleTabs.length,
    activePaneVisibleTabKeys,
    activeTabKey,
    closeTab,
    closeWorkspacePane,
    defaultNewTabLaunch,
    handleLaunchSurface,
    handleSelectPane,
    handleSelectTab,
    onCloseTab,
    onReopenClosedTab: useCallback(() => dispatch({ kind: "reopen-closed-tab" }), []),
    paneCount: paneLayout.paneCount,
    rootPane: state.rootPane,
  });

  // --- Zoom (extracted hook) ---

  const { zoomedTabKey, toggleZoom } = useWorkspaceCanvasZoom(activeTabKey, visibleTabsByPaneId);

  // --- Pane operations ---

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

  const handleReconcilePaneVisibleTabOrder = useCallback((paneId: string, keys: string[]) => {
    dispatch({ keys, kind: "reconcile-pane-visible-tab-order", paneId });
  }, []);

  const handleSetSplitRatio = useCallback((splitId: string, ratio: number) => {
    dispatch({ kind: "set-split-ratio", ratio, splitId });
  }, []);

  const handleResetAllSplitRatios = useCallback(() => {
    dispatch({ kind: "reset-all-split-ratios" });
  }, []);

  const handleSplitPane = useCallback(
    (paneId: string, direction: "column" | "row") => {
      const newPaneId = createWorkspacePaneId();
      dispatch({
        direction,
        kind: "split-pane",
        newPaneId,
        paneId,
        placement: "after",
        splitId: createWorkspaceSplitId(),
      });
      handleLaunchSurface(newPaneId, createAgentSurfaceLaunchRequest(defaultNewTabLaunch));
    },
    [defaultNewTabLaunch, handleLaunchSurface],
  );

  // --- Tree model assembly ---

  const treeActions = useMemo<WorkspacePaneTreeActions>(
    () => ({
      closeTab: (tabKey: string) => {
        closeTab(tabKey);
      },
      fileSessionStateChange: handleFileSessionStateChange,
      launchSurface: handleLaunchSurface,
      moveTabToPane: handleMoveTabToPane,
      openFile: handleOpenFile,
      reconcilePaneVisibleTabOrder: handleReconcilePaneVisibleTabOrder,
      resetAllSplitRatios: handleResetAllSplitRatios,
      selectPane: handleSelectPane,
      selectTab: handleSelectTab,
      setSplitRatio: handleSetSplitRatio,
      splitPane: handleSplitPane,
      tabViewStateChange: handleActiveTabViewStateChange,
      toggleZoom,
    }),
    [
      closeTab,
      handleActiveTabViewStateChange,
      handleFileSessionStateChange,
      handleLaunchSurface,
      handleMoveTabToPane,
      handleOpenFile,
      handleReconcilePaneVisibleTabOrder,
      handleResetAllSplitRatios,
      handleSelectPane,
      handleSelectTab,
      handleSetSplitRatio,
      handleSplitPane,
      toggleZoom,
    ],
  );

  const treeModel = useMemo<WorkspacePaneTreeModel>(
    () => ({
      dimInactivePanes,
      inactivePaneOpacity,
      paneCount: paneLayout.paneCount,
      panesById,
      rootPane: state.rootPane,
      surfaceActions,
      zoomedTabKey,
    }),
    [
      dimInactivePanes,
      inactivePaneOpacity,
      paneLayout.paneCount,
      panesById,
      state.rootPane,
      surfaceActions,
      zoomedTabKey,
    ],
  );

  return {
    error,
    treeActions,
    treeModel,
  };
}

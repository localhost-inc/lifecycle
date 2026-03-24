import type { AgentSessionProviderId, TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import { useAgentStatusIndex } from "@/features/agents/state/agent-session-state";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useStoreContext } from "@/store/provider";
import { useAgentOrchestrator, useAgentSessions, useRuntime } from "@/store";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";
import {
  isFileViewerDirty,
  type FileViewerSessionState,
} from "@/features/explorer/lib/file-session";
import { recordWorkspaceExplorerUsage } from "@/features/explorer/lib/workspace-explorer-usage";
import { useWorkspaceFileSessions } from "@/features/explorer/state/workspace-file-sessions";
import {
  createTerminal,
  detachTerminal,
  interruptTerminal,
  renameTerminal,
  terminalHasLiveSession,
  type CreateTerminalRequest,
} from "@/features/terminals/api";
import { useWorkspaceTerminals } from "@/features/terminals/hooks";
import { hideNativeTerminalSurface } from "@/features/terminals/native-surface-api";
import { useTerminalResponseReady } from "@/features/terminals/state/terminal-response-ready-provider";
import { subscribeToNativeWorkspaceShortcutEvents } from "@/features/workspaces/native-shortcuts-api";
import {
  getAdjacentPaneId,
  inspectWorkspacePaneLayout,
  requireWorkspacePane,
} from "@/features/workspaces/lib/workspace-pane-layout";
import { formatWorkspaceError } from "@/features/workspaces/lib/workspace-errors";
import { consumePendingTerminalFocus } from "@/features/notifications/lib/notification-navigation";
import {
  getWorkspaceDocument,
  isAgentTab,
  listWorkspaceDocuments,
  listWorkspaceHiddenTerminalTabKeys,
  listWorkspacePaneTabSnapshots,
  listWorkspaceTabViewStateByKey,
  readWorkspaceCanvasState,
  terminalIdFromTabKey,
  terminalTabKey,
  type WorkspaceCanvasDocumentsByKey,
  type WorkspaceCanvasTabViewState,
  writeWorkspaceCanvasState,
} from "@/features/workspaces/state/workspace-canvas-state";
import {
  createWorkspaceCanvasId,
  createWorkspacePaneId,
  createWorkspaceSplitId,
} from "@/features/workspaces/canvas/workspace-canvas-ids";
import type {
  WorkspacePaneActiveSurfaceModel,
  WorkspacePaneModel,
  WorkspacePaneTabModel,
  WorkspacePaneTreeActions,
  WorkspacePaneTreeModel,
} from "@/features/workspaces/canvas/workspace-pane-models";
import {
  createAgentOpenInput,
  type OpenDocumentRequest,
} from "@/features/workspaces/canvas/workspace-canvas-requests";
import { workspaceCanvasReducer } from "@/features/workspaces/canvas/workspace-canvas-reducer";
import {
  releaseWebviewFocus,
  resolveWorkspaceCloseShortcutTarget,
  shouldTreatWindowCloseAsTabClose,
  toWorkspaceTabHotkeyAction,
  type WorkspaceTabHotkeyAction,
} from "@/features/workspaces/canvas/workspace-canvas-shortcuts";
import { useSettings } from "@/features/settings/state/settings-provider";
import {
  type SurfaceLaunchAction,
  type SurfaceLaunchRequest,
} from "@/features/workspaces/surfaces/surface-launch-actions";
import { ClaudeIcon, CodexIcon, ShellIcon } from "@/features/workspaces/surfaces/surface-icons";
import {
  areStringArraysEqual,
  getWorkspaceAdjacentTabKey,
  orderWorkspaceTerminals,
  reconcileHiddenTerminalTabKeys,
  resolveWorkspaceVisibleTabs,
  type TerminalTab,
  type WorkspaceCanvasTab,
} from "@/features/workspaces/canvas/workspace-canvas-tabs";
import {
  getWorkspaceInactiveTerminalIds,
  getWorkspaceLiveTerminalTabKeys,
  getWorkspacePaneIdsWaitingForSelectedTerminalTab,
  getWorkspaceRenderedPaneActiveTabKeys,
  getWorkspaceSuppressedSleepingTerminalTabKeys,
  getWorkspaceUnassignedLiveTerminalTabKeys,
} from "@/features/workspaces/canvas/workspace-canvas-terminal-state";
import { closeWorkspacePaneTabs } from "@/features/workspaces/canvas/panes/workspace-pane-close";

function defaultAgentLabel(provider: AgentSessionProviderId): string {
  return provider === "claude" ? "Claude" : "Codex";
}

export interface WorkspaceCanvasControllerInput {
  openDocumentRequest: OpenDocumentRequest | null;
  onCloseWorkspaceTab?: () => void;
  onOpenDocumentRequestHandled?: (requestId: string) => void;
  workspaceId: string;
}

export function shouldAutoCreateDefaultWorkspaceTerminal(input: {
  documentCount: number;
  terminalCount: number;
  terminalsResolved: boolean;
}): boolean {
  return input.terminalsResolved && input.terminalCount === 0 && input.documentCount === 0;
}

interface OptimisticTerminalTab extends TerminalTab {
  placeholderKey: string;
}

function createPendingTerminalTab(): OptimisticTerminalTab {
  const placeholderKey = `pending-terminal:${crypto.randomUUID()}`;
  return {
    key: placeholderKey,
    kind: "terminal",
    label: "Shell",
    launchType: "shell",
    optimistic: "pending",
    placeholderKey,
    responseReady: false,
    running: false,
    status: "active",
    terminalId: placeholderKey,
  };
}

function createOptimisticTerminalTabFromRecord(
  terminal: TerminalRecord,
  placeholderKey: string,
): OptimisticTerminalTab {
  return {
    key: terminalTabKey(terminal.id),
    kind: "terminal",
    label: terminal.label,
    launchType: terminal.launch_type,
    optimistic: "created",
    placeholderKey,
    responseReady: false,
    running: false,
    status: terminal.status as TerminalStatus,
    terminalId: terminal.id,
  };
}

export function mergeWorkspaceTerminalTabs(
  persistedTerminalTabs: readonly TerminalTab[],
  optimisticTerminalTabs: readonly OptimisticTerminalTab[],
): TerminalTab[] {
  const mergedTabs = [...persistedTerminalTabs];
  const persistedKeys = new Set(persistedTerminalTabs.map((tab) => tab.key));

  for (const optimisticTab of optimisticTerminalTabs) {
    if (persistedKeys.has(optimisticTab.key)) {
      continue;
    }

    mergedTabs.push(optimisticTab);
  }

  return mergedTabs;
}

export function pruneOptimisticTerminalTabs(
  optimisticTerminalTabs: readonly OptimisticTerminalTab[],
  persistedTerminalTabs: readonly TerminalTab[],
): OptimisticTerminalTab[] {
  const persistedKeys = new Set(persistedTerminalTabs.map((tab) => tab.key));
  return optimisticTerminalTabs.filter((tab) => !persistedKeys.has(tab.key));
}

function createWorkspacePaneTabModels(
  visibleTabs: readonly WorkspaceCanvasTab[],
  fileSessionsByTabKey: Record<string, FileViewerSessionState>,
): WorkspacePaneTabModel[] {
  return visibleTabs.map((tab) => ({
    dirty:
      tab.kind === "file-viewer" ? isFileViewerDirty(fileSessionsByTabKey[tab.key] ?? null) : false,
    tab,
  }));
}

function resolveWorkspacePaneActiveSurface(input: {
  activeTabKey: string | null;
  creatingSelection: "shell" | "claude" | "codex" | null;
  documentsByKey: WorkspaceCanvasDocumentsByKey;
  fileSessionsByTabKey: Record<string, FileViewerSessionState>;
  terminalsById: ReadonlyMap<string, TerminalRecord>;
  visibleTabs: readonly WorkspaceCanvasTab[];
  viewStateByTabKey: Record<string, WorkspaceCanvasTabViewState>;
  waitingForSelectedTerminalTab: boolean;
  workspaceId: string;
}): WorkspacePaneActiveSurfaceModel {
  const {
    activeTabKey,
    creatingSelection,
    documentsByKey,
    fileSessionsByTabKey,
    terminalsById,
    viewStateByTabKey,
    visibleTabs,
    waitingForSelectedTerminalTab,
    workspaceId,
  } = input;

  if (visibleTabs.length === 0) {
    return waitingForSelectedTerminalTab
      ? { kind: "waiting-terminal" }
      : { creatingSelection, kind: "launcher" };
  }

  if (!activeTabKey) {
    return { kind: "loading" };
  }

  const activeVisibleTab = visibleTabs.find((tab) => tab.key === activeTabKey) ?? null;
  if (!activeVisibleTab) {
    return { kind: "loading" };
  }

  if (activeVisibleTab.kind === "terminal") {
    if (activeVisibleTab.optimistic) {
      return { kind: "opening-terminal" };
    }

    const terminal = terminalsById.get(activeVisibleTab.terminalId);
    return terminal ? { kind: "terminal", tab: activeVisibleTab, terminal } : { kind: "loading" };
  }

  const document = getWorkspaceDocument(documentsByKey, activeTabKey);
  if (!document) {
    return { kind: "loading" };
  }

  const viewState = viewStateByTabKey[activeTabKey] ?? null;

  switch (document.kind) {
    case "changes-diff":
      return { document, kind: "changes-diff", viewState, workspaceId };
    case "commit-diff":
      return { document, kind: "commit-diff", viewState, workspaceId };
    case "preview":
      return { document, kind: "preview" };
    case "agent":
      return { document, kind: "agent", workspaceId };
    case "pull-request":
      return { document, kind: "pull-request", viewState, workspaceId };
    case "file-viewer":
      return {
        document,
        kind: "file-viewer",
        sessionState: fileSessionsByTabKey[document.key] ?? null,
        viewState,
        workspaceId,
      };
  }
}

export function useWorkspaceCanvasController({
  openDocumentRequest,
  onCloseWorkspaceTab,
  onOpenDocumentRequestHandled,
  workspaceId,
}: WorkspaceCanvasControllerInput) {
  const { collections } = useStoreContext();
  const agentOrchestrator = useAgentOrchestrator();
  const runtime = useRuntime();
  const agentSessions = useAgentSessions(workspaceId);
  const workspaceTerminals = useWorkspaceTerminals(workspaceId);
  const { defaultNewTabLaunch, dimInactivePanes, inactivePaneOpacity } = useSettings();
  const { clearAgentSessionResponseReady, isAgentSessionResponseReady, isAgentSessionRunning } =
    useAgentStatusIndex();
  const {
    clearTerminalResponseReady,
    clearTerminalTurnRunning,
    isTerminalResponseReady,
    isTerminalTurnRunning,
  } = useTerminalResponseReady();
  const [creatingSelection, setCreatingSelection] = useState<"shell" | "claude" | "codex" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [optimisticTerminalTabs, setOptimisticTerminalTabs] = useState<OptimisticTerminalTab[]>([]);
  const [zoomedTabKey, setZoomedTabKey] = useState<string | null>(null);
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [state, dispatch] = useReducer(
    workspaceCanvasReducer,
    workspaceId,
    readWorkspaceCanvasState,
  );
  const closedTabStackRef = useRef(state.closedTabStack);
  closedTabStackRef.current = state.closedTabStack;
  const closeShortcutTriggeredAtRef = useRef(0);
  const closeShortcutHandledAtRef = useRef(0);

  const terminals = useMemo(
    () =>
      orderWorkspaceTerminals(
        workspaceTerminals.filter((terminal) => terminalHasLiveSession(terminal.status)),
      ),
    [workspaceTerminals],
  );
  const persistedTerminalTabs = useMemo<TerminalTab[]>(
    () =>
      terminals.map((terminal) => ({
        key: terminalTabKey(terminal.id),
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
  const terminalTabs = useMemo(
    () => mergeWorkspaceTerminalTabs(persistedTerminalTabs, optimisticTerminalTabs),
    [optimisticTerminalTabs, persistedTerminalTabs],
  );
  const liveTerminalTabKeys = useMemo(
    () => getWorkspaceLiveTerminalTabKeys(persistedTerminalTabs),
    [persistedTerminalTabs],
  );
  const [restoredSleepingTerminalTabKeys, setRestoredSleepingTerminalTabKeys] = useState<string[]>(
    [],
  );
  const restoredSleepingTerminalTabKeySet = useMemo(
    () => new Set(restoredSleepingTerminalTabKeys),
    [restoredSleepingTerminalTabKeys],
  );
  const suppressedSleepingTerminalTabKeys = useMemo(
    () =>
      getWorkspaceSuppressedSleepingTerminalTabKeys(
        terminalTabs,
        restoredSleepingTerminalTabKeySet,
      ),
    [restoredSleepingTerminalTabKeySet, terminalTabs],
  );
  const suppressedSleepingTerminalTabKeySet = useMemo(
    () => new Set(suppressedSleepingTerminalTabKeys),
    [suppressedSleepingTerminalTabKeys],
  );
  const autoRenderableLiveTerminalTabKeys = useMemo(
    () => liveTerminalTabKeys.filter((key) => !suppressedSleepingTerminalTabKeySet.has(key)),
    [liveTerminalTabKeys, suppressedSleepingTerminalTabKeySet],
  );
  const liveTerminalTabKeySet = useMemo(
    () => new Set(autoRenderableLiveTerminalTabKeys),
    [autoRenderableLiveTerminalTabKeys],
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
  const documents = useMemo(
    () =>
      listWorkspaceDocuments(state.documentsByKey).map((document) =>
        isAgentTab(document)
          ? {
              ...document,
              label: agentSessionTitleBySessionId.get(document.agentSessionId) ?? document.label,
              responseReady: isAgentSessionResponseReady(document.agentSessionId),
              running: isAgentSessionRunning(document.agentSessionId),
            }
          : document,
      ),
    [
      agentSessionTitleBySessionId,
      isAgentSessionResponseReady,
      isAgentSessionRunning,
      state.documentsByKey,
    ],
  );
  const documentsByKey = useMemo(
    () => Object.fromEntries(documents.map((document) => [document.key, document])),
    [documents],
  );

  // Persist session title changes into the canvas reducer state so labels survive restarts.
  useEffect(() => {
    for (const [sessionId, title] of agentSessionTitleBySessionId) {
      for (const doc of listWorkspaceDocuments(state.documentsByKey)) {
        if (isAgentTab(doc) && doc.agentSessionId === sessionId && doc.label !== title) {
          dispatch({ kind: "update-document-label", key: doc.key, label: title });
        }
      }
    }
  }, [agentSessionTitleBySessionId, state.documentsByKey]);

  const hiddenTerminalTabKeys = useMemo(
    () => listWorkspaceHiddenTerminalTabKeys(state.tabStateByKey),
    [state.tabStateByKey],
  );
  const suppressedHiddenTerminalTabKeys = useMemo(() => {
    const keys = [...hiddenTerminalTabKeys];
    for (const key of suppressedSleepingTerminalTabKeys) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
    return keys;
  }, [hiddenTerminalTabKeys, suppressedSleepingTerminalTabKeys]);
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
            documentsByKey,
            pane.tabOrderKeys,
            suppressedHiddenTerminalTabKeys,
          ),
        ]),
      ),
    [documentsByKey, paneSnapshots, suppressedHiddenTerminalTabKeys, terminalTabs],
  );
  const renderedActiveTabKeyByPaneId = useMemo(
    () => getWorkspaceRenderedPaneActiveTabKeys(paneSnapshots, visibleTabsByPaneId),
    [paneSnapshots, visibleTabsByPaneId],
  );
  const inactiveTerminalIds = useMemo(
    () =>
      getWorkspaceInactiveTerminalIds(
        autoRenderableLiveTerminalTabKeys,
        renderedActiveTabKeyByPaneId,
      ),
    [autoRenderableLiveTerminalTabKeys, renderedActiveTabKeyByPaneId],
  );
  const activePaneVisibleTabs = activePane ? (visibleTabsByPaneId[activePane.id] ?? []) : [];
  const activePaneVisibleTabKeys = useMemo(
    () => activePaneVisibleTabs.map((tab) => tab.key),
    [activePaneVisibleTabs],
  );
  const knownTerminalTabKeys = useMemo(
    () => workspaceTerminals.map((terminal) => terminalTabKey(terminal.id)),
    [workspaceTerminals],
  );
  const pendingTerminalLaunchesRef = useRef(new Set<string>());
  const assignedPaneTabKeys = useMemo(
    () => new Set(paneSnapshots.flatMap((pane) => pane.tabOrderKeys)),
    [paneSnapshots],
  );
  const activeTabKey = activePane ? (renderedActiveTabKeyByPaneId[activePane.id] ?? null) : null;
  const activeTerminalId = activeTabKey ? terminalIdFromTabKey(activeTabKey) : null;
  const activeAgentSessionId = useMemo(() => {
    if (!activeTabKey) {
      return null;
    }

    const activeDocument = getWorkspaceDocument(documentsByKey, activeTabKey);
    return activeDocument && isAgentTab(activeDocument) ? activeDocument.agentSessionId : null;
  }, [activeTabKey, documentsByKey]);
  const handleToggleZoom = useCallback(() => {
    setZoomedTabKey((current) => {
      if (current !== null) {
        return null;
      }
      return activeTabKey;
    });
  }, [activeTabKey]);
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
  const terminalsById = useMemo(
    () => new Map(terminals.map((terminal) => [terminal.id, terminal])),
    [terminals],
  );
  const panesById = useMemo<Record<string, WorkspacePaneModel>>(
    () =>
      Object.fromEntries(
        paneSnapshots.map((pane) => {
          const visibleTabs = visibleTabsByPaneId[pane.id] ?? [];
          const activeTabKey = renderedActiveTabKeyByPaneId[pane.id] ?? null;
          const waitingForSelectedTerminalTab = paneIdsWaitingForSelectedTerminalTab.has(pane.id);

          return [
            pane.id,
            {
              activeSurface: resolveWorkspacePaneActiveSurface({
                activeTabKey,
                creatingSelection,
                documentsByKey,
                fileSessionsByTabKey,
                terminalsById,
                viewStateByTabKey,
                visibleTabs,
                waitingForSelectedTerminalTab,
                workspaceId,
              }),
              id: pane.id,
              isActive: pane.id === activePaneId,
              tabBar: {
                activeTabKey,
                dragPreview: null,
                paneId: pane.id,
                tabs: createWorkspacePaneTabModels(visibleTabs, fileSessionsByTabKey),
              },
            } satisfies WorkspacePaneModel,
          ];
        }),
      ),
    [
      activePaneId,
      creatingSelection,
      documentsByKey,
      fileSessionsByTabKey,
      paneIdsWaitingForSelectedTerminalTab,
      paneSnapshots,
      renderedActiveTabKeyByPaneId,
      terminalsById,
      viewStateByTabKey,
      visibleTabsByPaneId,
      workspaceId,
    ],
  );

  useEffect(() => {
    setOptimisticTerminalTabs((current) => {
      const nextTabs = pruneOptimisticTerminalTabs(current, persistedTerminalTabs);
      return nextTabs.length === current.length ? current : nextTabs;
    });
  }, [persistedTerminalTabs]);

  useEffect(() => {
    if (!openDocumentRequest) {
      return;
    }

    if (openDocumentRequest.kind === "file-viewer") {
      recordWorkspaceExplorerUsage(workspaceId, openDocumentRequest.filePath);
    }

    dispatch({
      request: openDocumentRequest,
      kind: "open-document",
    });
    onOpenDocumentRequestHandled?.(openDocumentRequest.id);
  }, [onOpenDocumentRequestHandled, openDocumentRequest, workspaceId]);

  // Debounced write — keeps localStorage current without blocking render.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      writeWorkspaceCanvasState(workspaceId, state);
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [state, workspaceId]);

  // Synchronous flush on close so no state is lost if the window closes
  // before the debounced write fires.
  useEffect(() => {
    const flush = () => writeWorkspaceCanvasState(workspaceId, stateRef.current);
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [workspaceId]);

  useEffect(() => {
    const syncDocumentVisible = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", syncDocumentVisible);

    return () => {
      document.removeEventListener("visibilitychange", syncDocumentVisible);
    };
  }, []);

  const terminalsResolved = true; // TanStack DB collections are synchronous

  useEffect(() => {
    const nextHiddenTerminalTabKeys = reconcileHiddenTerminalTabKeys(
      suppressedHiddenTerminalTabKeys,
      knownTerminalTabKeys,
      terminalsResolved,
    );

    if (!areStringArraysEqual(hiddenTerminalTabKeys, nextHiddenTerminalTabKeys)) {
      dispatch({
        keys: nextHiddenTerminalTabKeys,
        kind: "set-hidden-terminal-tab-keys",
      });
    }
  }, [
    hiddenTerminalTabKeys,
    knownTerminalTabKeys,
    suppressedHiddenTerminalTabKeys,
    terminalsResolved,
  ]);

  useEffect(() => {
    if (!terminalsResolved) {
      return;
    }

    const unassignedTerminalKeys = getWorkspaceUnassignedLiveTerminalTabKeys(
      autoRenderableLiveTerminalTabKeys,
      assignedPaneTabKeys,
      suppressedHiddenTerminalTabKeys,
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
  }, [
    activePaneId,
    assignedPaneTabKeys,
    autoRenderableLiveTerminalTabKeys,
    suppressedHiddenTerminalTabKeys,
    terminalsResolved,
  ]);

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
    if (!activeAgentSessionId || !documentVisible) {
      return;
    }

    if (!isAgentSessionResponseReady(activeAgentSessionId)) {
      return;
    }

    clearAgentSessionResponseReady(activeAgentSessionId);
  }, [
    activeAgentSessionId,
    clearAgentSessionResponseReady,
    documentVisible,
    isAgentSessionResponseReady,
  ]);

  useEffect(() => {
    renderedTerminalIdSetRef.current = new Set(
      Object.values(renderedActiveTabKeyByPaneId).flatMap((key) =>
        key
          ? [terminalIdFromTabKey(key)].filter(
              (terminalId): terminalId is string => terminalId !== null,
            )
          : [],
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
      const terminalId = terminalIdFromTabKey(key);
      if (terminalId !== null) {
        clearTerminalResponseReady(terminalId);
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
      recordWorkspaceExplorerUsage(workspaceId, filePath);
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
      const key = terminalTabKey(terminalId);
      if (suppressedSleepingTerminalTabKeySet.has(key)) {
        setRestoredSleepingTerminalTabKeys((current) =>
          current.includes(key) ? current : [...current, key],
        );
      }
      dispatch({
        key,
        kind: "show-terminal-tab",
        paneId,
        select: true,
      });
    },
    [clearTerminalResponseReady, suppressedSleepingTerminalTabKeySet],
  );

  const handleCreateTerminal = useCallback(
    async (input: CreateTerminalRequest, paneId?: string) => {
      if (paneId) {
        dispatch({ kind: "select-pane", paneId });
      }
      const optimisticTab = createPendingTerminalTab();
      pendingTerminalLaunchesRef.current.add(optimisticTab.placeholderKey);
      setOptimisticTerminalTabs((current) => [...current, optimisticTab]);
      dispatch({
        key: optimisticTab.key,
        kind: "show-terminal-tab",
        paneId,
        select: true,
      });
      setCreatingSelection("shell");
      setError(null);

      try {
        const terminal = await createTerminal(runtime, {
          ...input,
          workspaceId,
        });
        const nextOptimisticTab = createOptimisticTerminalTabFromRecord(
          terminal,
          optimisticTab.placeholderKey,
        );
        const wasDismissed = !pendingTerminalLaunchesRef.current.has(optimisticTab.placeholderKey);
        if (wasDismissed) {
          await detachTerminal(runtime, workspaceId, terminal.id);
          void collections.terminals.refresh();
          return;
        }

        setOptimisticTerminalTabs((current) =>
          current.map((tab) =>
            tab.placeholderKey === optimisticTab.placeholderKey ? nextOptimisticTab : tab,
          ),
        );
        dispatch({
          kind: "replace-terminal-tab-key",
          nextKey: nextOptimisticTab.key,
          previousKey: optimisticTab.key,
        });
        pendingTerminalLaunchesRef.current.delete(optimisticTab.placeholderKey);
        void collections.terminals.refresh();
      } catch (createError) {
        pendingTerminalLaunchesRef.current.delete(optimisticTab.placeholderKey);
        setOptimisticTerminalTabs((current) =>
          current.filter((tab) => tab.placeholderKey !== optimisticTab.placeholderKey),
        );
        dispatch({
          key: optimisticTab.key,
          kind: "discard-terminal-tab",
        });
        setError(formatWorkspaceError(createError, "Failed to create session."));
      } finally {
        setCreatingSelection(null);
      }
    },
    [collections.terminals, runtime, workspaceId],
  );

  const handleOpenAgentTab = useCallback(
    async (provider: AgentSessionProviderId, paneId?: string) => {
      if (paneId) {
        dispatch({ kind: "select-pane", paneId });
      }
      setCreatingSelection(provider);
      setError(null);

      try {
        const session = await agentOrchestrator.createDraftSession({
          provider,
          workspaceId,
        });
        dispatch({
          kind: "open-document",
          request: {
            ...createAgentOpenInput({
              agentSessionId: session.id,
              provider: session.provider,
              label: session.title.trim() || defaultAgentLabel(session.provider),
            }),
            id: createWorkspaceCanvasId(),
          },
        });

        void agentOrchestrator.bootstrapSession(session.id).catch((bootstrapError) => {
          console.error("[workspace] agent bootstrap failed:", bootstrapError);
        });
      } catch (createError) {
        setError(formatWorkspaceError(createError, "Failed to open agent."));
      } finally {
        setCreatingSelection(null);
      }
    },
    [agentOrchestrator, workspaceId],
  );

  const handleLaunchSurface = useCallback(
    (paneId: string, request: SurfaceLaunchRequest) => {
      switch (request.kind) {
        case "agent":
          void handleOpenAgentTab(request.provider, paneId);
          break;
        case "terminal":
          void handleCreateTerminal(request, paneId);
          break;
      }
    },
    [handleCreateTerminal, handleOpenAgentTab],
  );

  // Auto-create a default terminal when a workspace opens with no tabs.
  // Wait for the terminal query to resolve so hot reload does not treat
  // an already-populated workspace as empty during remount.
  const didAutoCreateTerminalRef = useRef(false);
  useEffect(() => {
    if (didAutoCreateTerminalRef.current) {
      return;
    }

    if (
      !shouldAutoCreateDefaultWorkspaceTerminal({
        documentCount: documents.length,
        terminalCount: terminals.length,
        terminalsResolved,
      })
    ) {
      if (terminalsResolved && (terminals.length > 0 || documents.length > 0)) {
        didAutoCreateTerminalRef.current = true;
      }
      return;
    }

    didAutoCreateTerminalRef.current = true;
    const request: SurfaceLaunchRequest =
      defaultNewTabLaunch === "shell"
        ? { kind: "terminal", launchType: "shell" }
        : { kind: "agent", provider: defaultNewTabLaunch };
    handleLaunchSurface(activePaneId, request);
  }, [
    activePaneId,
    defaultNewTabLaunch,
    documents.length,
    handleLaunchSurface,
    terminals.length,
    terminalsResolved,
  ]);

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
        request: { kind: "agent", provider: "claude" },
        loading: creatingSelection === "claude",
        disabled: creatingSelection !== null,
      },
      {
        key: "codex",
        title: "Codex",
        icon: <CodexIcon />,
        request: { kind: "agent", provider: "codex" },
        loading: creatingSelection === "codex",
        disabled: creatingSelection !== null,
      },
    ],
    [creatingSelection],
  );

  const closeTerminalTab = useCallback(
    async (tabKey: string, terminalId: string) => {
      const optimisticTab = optimisticTerminalTabs.find((tab) => tab.key === tabKey);
      if (optimisticTab) {
        pendingTerminalLaunchesRef.current.delete(optimisticTab.placeholderKey);
        setOptimisticTerminalTabs((current) => current.filter((tab) => tab.key !== tabKey));
        dispatch({
          key: tabKey,
          kind: "discard-terminal-tab",
        });

        if (optimisticTab.optimistic === "created") {
          try {
            clearTerminalResponseReady(terminalId);
            await detachTerminal(runtime, workspaceId, terminalId);
            void collections.terminals.refresh();
            return true;
          } catch (closeError) {
            setError(formatWorkspaceError(closeError, "Failed to close session."));
            return false;
          }
        }

        return true;
      }

      try {
        clearTerminalResponseReady(terminalId);
        await detachTerminal(runtime, workspaceId, terminalId);
        void collections.terminals.refresh();
        dispatch({
          key: tabKey,
          kind: "hide-terminal-tab",
          terminalId,
        });
        return true;
      } catch (closeError) {
        setError(formatWorkspaceError(closeError, "Failed to close session."));
        return false;
      }
    },
    [
      clearTerminalResponseReady,
      collections.terminals,
      optimisticTerminalTabs,
      runtime,
      workspaceId,
    ],
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
          const request: SurfaceLaunchRequest =
            defaultNewTabLaunch === "shell"
              ? { kind: "terminal", launchType: "shell" }
              : { kind: "agent", provider: defaultNewTabLaunch };
          handleLaunchSurface(activePaneId, request);
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

          const isLastTabInPane = activePaneVisibleTabs.length === 1 && paneLayout.paneCount > 1;

          closeShortcutHandledAtRef.current = Date.now();
          if (activeTab.kind === "terminal") {
            if (isLastTabInPane) {
              void closeWorkspacePane(activePaneId);
            } else {
              void handleCloseTerminalTab(activeTab.key, activeTab.terminalId);
            }
            return true;
          }

          if (isLastTabInPane) {
            void closeWorkspacePane(activePaneId);
          } else {
            handleCloseDocumentTab(activeTab.key);
          }
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
          const topEntry = closedTabStackRef.current[0];
          if (topEntry?.kind === "terminal") {
            dispatch({ kind: "pop-closed-tab" });
            handleShowTerminalTab(topEntry.terminalId, activePaneId);
          } else {
            dispatch({ kind: "reopen-closed-tab" });
          }
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
      handleLaunchSurface,
      handleShowTerminalTab,
      onCloseWorkspaceTab,
      paneLayout.paneCount,
      handleSelectTab,
    ],
  );

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "new-tab" }),
    id: "workspace.new-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
    allowInEditable: true,
  });

  useShortcutRegistration({
    handler: () => {
      closeShortcutTriggeredAtRef.current = Date.now();
      return handleWorkspaceTabHotkeyAction({ kind: "close-active-tab" });
    },
    id: "workspace.close-active-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
    allowInEditable: true,
  });

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "reopen-closed-tab" }),
    id: "workspace.reopen-closed-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
    allowInEditable: true,
  });

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "previous-tab" }),
    id: "workspace.previous-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
    allowInEditable: true,
  });

  useShortcutRegistration({
    handler: () => handleWorkspaceTabHotkeyAction({ kind: "next-tab" }),
    id: "workspace.next-tab",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
    allowInEditable: true,
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
    allowInEditable: true,
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void subscribeToNativeWorkspaceShortcutEvents((event) => {
      if (disposed || event.source_surface_kind !== "native-terminal") {
        return;
      }

      if (event.action === "go-back") {
        window.history.back();
        return;
      }
      if (event.action === "go-forward") {
        window.history.forward();
        return;
      }
      if (event.action === "toggle-zoom") {
        handleToggleZoom();
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
  }, [handleToggleZoom, handleWorkspaceTabHotkeyAction]);

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

  const handleRenameTerminalTab = useCallback(
    (terminalId: string, label: string) => {
      return renameTerminal(runtime, workspaceId, terminalId, label);
    },
    [runtime, workspaceId],
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
      const request: SurfaceLaunchRequest =
        defaultNewTabLaunch === "shell"
          ? { kind: "terminal", launchType: "shell" }
          : { kind: "agent", provider: defaultNewTabLaunch };
      handleLaunchSurface(newPaneId, request);
    },
    [defaultNewTabLaunch, handleLaunchSurface],
  );

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
    allowInEditable: true,
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
      clearTerminalTurnRunning(activeTerminalId);
      void interruptTerminal(runtime, workspaceId, activeTerminalId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTerminalId,
    clearTerminalTurnRunning,
    isTerminalTurnRunning,
    runtime,
    workspaceId,
    zoomedTabKey,
  ]);

  const treeActions = useMemo<WorkspacePaneTreeActions>(
    () => ({
      closeDocumentTab: handleCloseDocumentTab,
      closeTerminalTab: handleCloseTerminalTab,
      fileSessionStateChange: handleFileSessionStateChange,
      launchSurface: handleLaunchSurface,
      moveTabToPane: handleMoveTabToPane,
      openFile: handleOpenFile,
      reconcilePaneVisibleTabOrder: handleReconcilePaneVisibleTabOrder,
      renameTerminalTab: handleRenameTerminalTab,
      resetAllSplitRatios: handleResetAllSplitRatios,
      selectPane: handleSelectPane,
      selectTab: handleSelectTab,
      setSplitRatio: handleSetSplitRatio,
      splitPane: handleSplitPane,
      tabViewStateChange: handleActiveTabViewStateChange,
      toggleZoom: handleToggleZoom,
    }),
    [
      handleActiveTabViewStateChange,
      handleCloseDocumentTab,
      handleCloseTerminalTab,
      handleFileSessionStateChange,
      handleLaunchSurface,
      handleMoveTabToPane,
      handleOpenFile,
      handleReconcilePaneVisibleTabOrder,
      handleRenameTerminalTab,
      handleResetAllSplitRatios,
      handleSelectPane,
      handleSelectTab,
      handleSetSplitRatio,
      handleSplitPane,
      handleToggleZoom,
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

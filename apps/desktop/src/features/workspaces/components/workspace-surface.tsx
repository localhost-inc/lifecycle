import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQueryClient } from "../../../query";
import { collectWorkspacePaneLeaves, findWorkspacePaneById } from "../lib/workspace-surface-panes";
import { recordWorkspaceFileUsage } from "../../files/lib/workspace-file-usage";
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
import { subscribeToNativeWorkspaceShortcutEvents } from "../api";
import { formatWorkspaceError } from "../lib/workspace-errors";
import {
  isRuntimeTabKey,
  type WorkspaceSurfaceState,
  writeWorkspaceSurfaceState,
} from "../state/workspace-surface-state";
import { isPullRequestDocument } from "../state/workspace-surface-state";
import { type SurfaceLaunchAction, type SurfaceLaunchRequest } from "./surface-launch-actions";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";
import {
  areStringArraysEqual,
  createInitialWorkspaceSurfaceState,
  createWorkspaceSurfaceId,
  getWorkspaceAdjacentTabKey,
  createWorkspacePaneId,
  createWorkspaceSplitId,
  getWorkspaceTabKeyByIndex,
  isEditableTarget,
  isMacPlatform,
  orderWorkspaceTerminals,
  readWorkspaceTabHotkeyAction,
  reconcileHiddenRuntimeTabKeys,
  releaseWebviewFocus,
  resolveWorkspaceVisibleTabs,
  shouldTreatWindowCloseAsTabClose,
  toWorkspaceTabHotkeyAction,
  workspaceSurfaceReducer,
  type OpenDocumentRequest,
  type RuntimeTab,
  type WorkspaceTabHotkeyAction,
} from "./workspace-surface-logic";
import {
  hasFileViewerConflict,
  isFileViewerDirty,
  type FileViewerSessionState,
} from "../../files/lib/file-session";
import { WorkspaceSurfacePaneTree } from "./workspace-surface-pane-tree";
import {
  getWorkspaceLiveRuntimeTabKeys,
  getWorkspaceResolvedPaneActiveTabKeys,
  getWorkspaceUnassignedLiveRuntimeTabKeys,
  getWorkspaceWaitingForRuntimePaneIds,
} from "./workspace-surface-runtime-state";

interface WorkspaceSurfaceProps {
  openDocumentRequest: OpenDocumentRequest | null;
  onActivePullRequestNumberChange?: (pullRequestNumber: number | null) => void;
  onOpenDocumentRequestHandled?: (requestId: string) => void;
  snapshotTerminals: TerminalRecord[];
  workspaceId: string;
}

export function WorkspaceSurface({
  openDocumentRequest,
  onActivePullRequestNumberChange,
  onOpenDocumentRequestHandled,
  snapshotTerminals,
  workspaceId,
}: WorkspaceSurfaceProps) {
  const client = useQueryClient();
  const { clearTerminalResponseReady, isTerminalResponseReady, isTerminalTurnRunning } =
    useTerminalResponseReady();
  const [creatingSelection, setCreatingSelection] = useState<"shell" | HarnessProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [fileSessionsByTabKey, setFileSessionsByTabKey] = useState<
    Record<string, FileViewerSessionState>
  >({});
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [state, dispatch] = useReducer(
    workspaceSurfaceReducer,
    workspaceId,
    createInitialWorkspaceSurfaceState,
  );
  const closeShortcutTriggeredAtRef = useRef(0);
  const closeShortcutHandledAtRef = useRef(0);

  const sessionHistory = useMemo(() => snapshotTerminals, [snapshotTerminals]);
  const terminals = useMemo(
    () =>
      orderWorkspaceTerminals(
        sessionHistory.filter((terminal) => terminalHasLiveSession(terminal.status)),
      ),
    [sessionHistory],
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
  const paneLeaves = useMemo(() => collectWorkspacePaneLeaves(state.rootPane), [state.rootPane]);
  const activePane =
    (state.activePaneId ? findWorkspacePaneById(state.rootPane, state.activePaneId) : null) ??
    paneLeaves[0] ??
    null;
  const activePaneId = activePane?.id ?? null;
  const visibleTabsByPaneId = useMemo(
    () =>
      Object.fromEntries(
        paneLeaves.map((pane) => [
          pane.id,
          resolveWorkspaceVisibleTabs(
            runtimeTabs,
            state.documents,
            pane.tabOrderKeys,
            state.hiddenRuntimeTabKeys,
          ),
        ]),
      ),
    [paneLeaves, runtimeTabs, state.documents, state.hiddenRuntimeTabKeys],
  );
  const resolvedActiveTabKeyByPaneId = useMemo(
    () => getWorkspaceResolvedPaneActiveTabKeys(paneLeaves, visibleTabsByPaneId),
    [paneLeaves, visibleTabsByPaneId],
  );
  const activePaneVisibleTabs = activePane ? (visibleTabsByPaneId[activePane.id] ?? []) : [];
  const activePaneVisibleTabKeys = useMemo(
    () => activePaneVisibleTabs.map((tab) => tab.key),
    [activePaneVisibleTabs],
  );
  const knownRuntimeTabKeys = useMemo(
    () => sessionHistory.map((terminal) => `terminal:${terminal.id}`),
    [sessionHistory],
  );
  const assignedPaneTabKeys = useMemo(
    () => new Set(paneLeaves.flatMap((pane) => pane.tabOrderKeys)),
    [paneLeaves],
  );
  const activeTabKey = activePane ? (resolvedActiveTabKeyByPaneId[activePane.id] ?? null) : null;
  const activeTerminalId =
    activeTabKey && isRuntimeTabKey(activeTabKey) ? activeTabKey.slice("terminal:".length) : null;
  const activePullRequestNumber = useMemo(() => {
    if (!activeTabKey) {
      return null;
    }

    const activeDocument = state.documents.find((document) => document.key === activeTabKey);
    return activeDocument && isPullRequestDocument(activeDocument) ? activeDocument.number : null;
  }, [activeTabKey, state.documents]);
  const waitingForRuntimePaneIds = useMemo(
    () =>
      getWorkspaceWaitingForRuntimePaneIds(paneLeaves, visibleTabsByPaneId, liveRuntimeTabKeySet),
    [liveRuntimeTabKeySet, paneLeaves, visibleTabsByPaneId],
  );

  useEffect(() => {
    const openFileTabKeys = new Set(
      state.documents
        .filter((document) => document.kind === "file-viewer")
        .map((document) => document.key),
    );

    setFileSessionsByTabKey((current) => {
      const nextEntries = Object.entries(current).filter(([key]) => openFileTabKeys.has(key));
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [state.documents]);

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
  }, [onOpenDocumentRequestHandled, openDocumentRequest]);

  useEffect(() => {
    writeWorkspaceSurfaceState(workspaceId, state);
  }, [state, workspaceId]);

  useEffect(() => {
    onActivePullRequestNumberChange?.(activePullRequestNumber);
  }, [activePullRequestNumber, onActivePullRequestNumberChange]);

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
      state.hiddenRuntimeTabKeys,
      knownRuntimeTabKeys,
      true,
    );

    if (!areStringArraysEqual(state.hiddenRuntimeTabKeys, nextHiddenRuntimeTabKeys)) {
      dispatch({
        keys: nextHiddenRuntimeTabKeys,
        kind: "set-hidden-runtime-tab-keys",
      });
    }
  }, [knownRuntimeTabKeys, state.hiddenRuntimeTabKeys]);

  useEffect(() => {
    const targetPaneId = activePaneId ?? paneLeaves[0]?.id ?? null;
    if (!targetPaneId) {
      return;
    }

    const unassignedRuntimeKeys = getWorkspaceUnassignedLiveRuntimeTabKeys(
      liveRuntimeTabKeys,
      assignedPaneTabKeys,
      state.hiddenRuntimeTabKeys,
    );
    if (unassignedRuntimeKeys.length === 0) {
      return;
    }

    for (const key of unassignedRuntimeKeys) {
      dispatch({
        key,
        kind: "show-runtime-tab",
        paneId: targetPaneId,
        select: false,
      });
    }
  }, [
    activePaneId,
    assignedPaneTabKeys,
    liveRuntimeTabKeys,
    paneLeaves,
    state.hiddenRuntimeTabKeys,
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
    (tabKey: string, viewState: WorkspaceSurfaceState["viewStateByTabKey"][string] | null) => {
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

  const confirmCloseFileSession = useCallback(
    (tabKey: string, label: string) => {
      const session = fileSessionsByTabKey[tabKey];
      if (!isFileViewerDirty(session)) {
        return true;
      }

      const message = hasFileViewerConflict(session)
        ? `"${label}" has unsaved edits and changed on disk. Close the tab and discard your local draft?`
        : `"${label}" has unsaved edits. Close the tab and discard them?`;
      return window.confirm(message);
    },
    [fileSessionsByTabKey],
  );

  const handleShowRuntimeTab = useCallback(
    (terminalId: string, paneId?: string) => {
      releaseWebviewFocus();
      clearTerminalResponseReady(terminalId);
      const runtimeKey = `terminal:${terminalId}`;
      dispatch({ key: runtimeKey, kind: "show-runtime-tab", paneId, select: true });
    },
    [clearTerminalResponseReady],
  );

  const handleCreateTerminal = useCallback(
    async (input: CreateTerminalRequest, paneId?: string) => {
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
      const closingDocument = state.documents.find((document) => document.key === tabKey) ?? null;
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
      setFileSessionsByTabKey((current) => {
        if (!(tabKey in current)) {
          return current;
        }

        const next = { ...current };
        delete next[tabKey];
        return next;
      });
    },
    [confirmCloseFileSession, state.documents],
  );

  const handleFileSessionStateChange = useCallback(
    (tabKey: string, nextState: FileViewerSessionState | null) => {
      setFileSessionsByTabKey((current) => {
        if (nextState === null) {
          if (!(tabKey in current)) {
            return current;
          }

          const next = { ...current };
          delete next[tabKey];
          return next;
        }

        const previous = current[tabKey];
        if (
          previous?.draftContent === nextState.draftContent &&
          previous?.savedContent === nextState.savedContent &&
          previous?.conflictDiskContent === nextState.conflictDiskContent
        ) {
          return current;
        }

        return {
          ...current,
          [tabKey]: nextState,
        };
      });
    },
    [],
  );

  const handleWorkspaceTabHotkeyAction = useCallback(
    (action: WorkspaceTabHotkeyAction) => {
      switch (action.kind) {
        case "new-tab":
          void handleCreateTerminal({ launchType: "shell" }, activePaneId ?? undefined);
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
            handleSelectTab(activePaneId ?? "", nextKey);
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
            handleSelectTab(activePaneId ?? "", previousKey);
          }
          return;
        }
        case "select-tab-index": {
          const selectedKey = getWorkspaceTabKeyByIndex(activePaneVisibleTabKeys, action.index);
          if (selectedKey) {
            handleSelectTab(activePaneId ?? "", selectedKey);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <WorkspaceSurfacePaneTree
        activePaneId={activePaneId}
        creatingSelection={creatingSelection}
        documents={state.documents}
        fileSessionsByTabKey={fileSessionsByTabKey}
        onCloseDocumentTab={handleCloseDocumentTab}
        onClosePane={(paneId) => {
          dispatch({ kind: "close-pane", paneId });
        }}
        onCloseRuntimeTab={handleCloseRuntimeTab}
        onCreateTerminal={handleCreateTerminal}
        onFileSessionStateChange={handleFileSessionStateChange}
        onLaunchSurface={handleLaunchSurface}
        onMoveTabToPane={(
          key,
          sourcePaneId,
          targetPaneId,
          targetKey,
          placement,
          splitDirection,
          splitPlacement,
        ) => {
          if (splitDirection && splitPlacement) {
            const newPaneId = createWorkspacePaneId();
            dispatch({
              direction: splitDirection,
              kind: "split-pane",
              newPaneId,
              paneId: targetPaneId,
              placement: splitPlacement,
              splitId: createWorkspaceSplitId(),
            });
            dispatch({
              key,
              kind: "move-tab-to-pane",
              sourcePaneId,
              targetPaneId: newPaneId,
            });
            return;
          }

          dispatch({
            key,
            kind: "move-tab-to-pane",
            placement,
            sourcePaneId,
            targetKey,
            targetPaneId,
          });
        }}
        onOpenFile={handleOpenFile}
        onRenameRuntimeTab={(terminalId, label) => renameTerminal(terminalId, label)}
        onSelectPane={handleSelectPane}
        onSelectTab={handleSelectTab}
        onSetPaneTabOrder={(paneId, keys) => {
          dispatch({ keys, kind: "set-pane-tab-order", paneId });
        }}
        onSetSplitRatio={(splitId, ratio) => {
          dispatch({ kind: "set-split-ratio", ratio, splitId });
        }}
        onSplitPane={(paneId, direction) => {
          dispatch({
            direction,
            kind: "split-pane",
            newPaneId: createWorkspacePaneId(),
            paneId,
            placement: "after",
            splitId: createWorkspaceSplitId(),
          });
        }}
        onTabViewStateChange={handleActiveTabViewStateChange}
        paneCount={paneLeaves.length}
        rootPane={state.rootPane}
        resolvedActiveTabKeyByPaneId={resolvedActiveTabKeyByPaneId}
        surfaceActions={surfaceActions}
        terminals={terminals}
        visibleTabsByPaneId={visibleTabsByPaneId}
        viewStateByTabKey={state.viewStateByTabKey}
        waitingForRuntimePaneIds={waitingForRuntimePaneIds}
        workspaceId={workspaceId}
      />
    </div>
  );
}

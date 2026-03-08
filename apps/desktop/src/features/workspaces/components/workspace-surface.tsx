import type { TerminalStatus } from "@lifecycle/contracts";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useStoreClient } from "../../../store";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  createTerminal,
  detachTerminal,
  renameTerminal,
  terminalHasLiveSession,
  type CreateTerminalRequest,
  type HarnessProvider,
} from "../../terminals/api";
import { terminalKeys, useWorkspaceTerminals } from "../../terminals/hooks";
import { useTerminalResponseReady } from "../../terminals/state/terminal-response-ready-provider";
import { subscribeToNativeWorkspaceShortcutEvents } from "../api";
import { isRuntimeTabKey, writeWorkspaceSurfaceState } from "../state/workspace-surface-state";
import {
  SurfaceLaunchActions,
  type SurfaceLaunchAction,
  type SurfaceLaunchRequest,
} from "./surface-launch-actions";
import { ClaudeIcon, CodexIcon, ShellIcon, WorkspaceSurfaceTabLeading } from "./surface-icons";
import {
  areStringArraysEqual,
  createInitialWorkspaceSurfaceState,
  createWorkspaceLauncherId,
  getRightmostWorkspaceTabKey,
  getWorkspaceAdjacentTabKey,
  getWorkspaceTabClosePlan,
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
import { WorkspaceSurfacePanels } from "./workspace-surface-panels";
import { WorkspaceSurfaceTabBar } from "./workspace-surface-tab-bar";

interface WorkspaceSurfaceProps {
  openDocumentRequest: OpenDocumentRequest | null;
  workspaceId: string;
}

export function WorkspaceSurface({ openDocumentRequest, workspaceId }: WorkspaceSurfaceProps) {
  const client = useStoreClient();
  const { clearTerminalResponseReady, isTerminalResponseReady } = useTerminalResponseReady();
  const terminalsQuery = useWorkspaceTerminals(workspaceId);
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
    createInitialWorkspaceSurfaceState,
  );
  const closeShortcutTriggeredAtRef = useRef(0);
  const closeShortcutHandledAtRef = useRef(0);

  const sessionHistory = useMemo(() => terminalsQuery.data ?? [], [terminalsQuery.data]);
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
        type: "terminal",
        label: terminal.label,
        launchType: terminal.launch_type,
        responseReady: isTerminalResponseReady(terminal.id),
        status: terminal.status as TerminalStatus,
        terminalId: terminal.id,
      })),
    [isTerminalResponseReady, terminals],
  );
  const visibleTabs = useMemo(
    () =>
      resolveWorkspaceVisibleTabs(
        runtimeTabs,
        state.documents,
        state.tabOrderKeys,
        state.hiddenRuntimeTabKeys,
      ),
    [runtimeTabs, state.documents, state.hiddenRuntimeTabKeys, state.tabOrderKeys],
  );
  const visibleTabKeys = useMemo(() => visibleTabs.map((tab) => tab.key), [visibleTabs]);
  const knownRuntimeTabKeys = useMemo(
    () => sessionHistory.map((terminal) => `terminal:${terminal.id}`),
    [sessionHistory],
  );
  const activeTerminalId =
    state.activeTabKey && isRuntimeTabKey(state.activeTabKey)
      ? state.activeTabKey.slice("terminal:".length)
      : null;
  const waitingForActiveRuntimeTab = Boolean(
    state.activeTabKey &&
    isRuntimeTabKey(state.activeTabKey) &&
    terminalsQuery.isLoading &&
    !visibleTabKeys.includes(state.activeTabKey),
  );

  useEffect(() => {
    if (!openDocumentRequest) {
      return;
    }

    dispatch({
      request: openDocumentRequest,
      type: "open-document",
    });
  }, [openDocumentRequest]);

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
    if (!areStringArraysEqual(state.tabOrderKeys, visibleTabKeys)) {
      dispatch({ keys: visibleTabKeys, type: "set-tab-order" });
    }
  }, [state.tabOrderKeys, visibleTabKeys]);

  useEffect(() => {
    const nextHiddenRuntimeTabKeys = reconcileHiddenRuntimeTabKeys(
      state.hiddenRuntimeTabKeys,
      knownRuntimeTabKeys,
      terminalsQuery.status === "ready",
    );

    if (!areStringArraysEqual(state.hiddenRuntimeTabKeys, nextHiddenRuntimeTabKeys)) {
      dispatch({
        keys: nextHiddenRuntimeTabKeys,
        type: "set-hidden-runtime-tab-keys",
      });
    }
  }, [knownRuntimeTabKeys, state.hiddenRuntimeTabKeys, terminalsQuery.status]);

  useEffect(() => {
    if (waitingForActiveRuntimeTab) {
      return;
    }

    if (visibleTabs.length === 0) {
      if (state.activeTabKey !== null) {
        dispatch({ key: null, type: "sync-active" });
      }
      return;
    }

    if (!state.activeTabKey) {
      dispatch({ key: getRightmostWorkspaceTabKey(visibleTabs), type: "sync-active" });
      return;
    }

    if (!visibleTabs.some((tab) => tab.key === state.activeTabKey)) {
      dispatch({ key: getRightmostWorkspaceTabKey(visibleTabs), type: "sync-active" });
    }
  }, [state.activeTabKey, visibleTabs, waitingForActiveRuntimeTab]);

  useEffect(() => {
    if (waitingForActiveRuntimeTab) {
      return;
    }

    if (visibleTabs.length === 0 && !state.documents.some((tab) => tab.type === "launcher")) {
      dispatch({
        launcherId: createWorkspaceLauncherId(),
        type: "open-launcher",
      });
    }
  }, [state.documents, visibleTabs.length, waitingForActiveRuntimeTab]);

  useEffect(() => {
    if (!activeTerminalId || !documentVisible) {
      return;
    }

    if (!isTerminalResponseReady(activeTerminalId)) {
      return;
    }

    clearTerminalResponseReady(activeTerminalId);
  }, [
    activeTerminalId,
    clearTerminalResponseReady,
    documentVisible,
    isTerminalResponseReady,
  ]);

  const handleSelectTab = useCallback(
    (key: string) => {
      releaseWebviewFocus();
      if (isRuntimeTabKey(key)) {
        clearTerminalResponseReady(key.slice("terminal:".length));
      }
      dispatch({ key, type: "select-tab" });
    },
    [clearTerminalResponseReady],
  );

  const handleOpenLauncher = useCallback(() => {
    dispatch({
      launcherId: createWorkspaceLauncherId(),
      type: "open-launcher",
    });
  }, []);

  const handleShowRuntimeTab = useCallback(
    (terminalId: string, launcherKey?: string) => {
      releaseWebviewFocus();
      clearTerminalResponseReady(terminalId);
      const runtimeKey = `terminal:${terminalId}`;
      dispatch(
        launcherKey
          ? { launcherKey, tabKey: runtimeKey, type: "replace-launcher-with-tab" }
          : { key: runtimeKey, select: true, type: "show-runtime-tab" },
      );
    },
    [clearTerminalResponseReady],
  );

  const handleCreateTerminal = useCallback(
    async (input: CreateTerminalRequest, launcherKey?: string) => {
      setCreatingSelection(input.launchType === "harness" ? input.harnessProvider : "shell");
      setError(null);
      releaseWebviewFocus();

      try {
        const terminal = await createTerminal({
          cols: DEFAULT_TERMINAL_COLS,
          ...input,
          rows: DEFAULT_TERMINAL_ROWS,
          workspaceId,
        });
        client.invalidate(terminalKeys.byWorkspace(workspaceId));
        client.invalidate(terminalKeys.detail(terminal.id));
        handleShowRuntimeTab(terminal.id, launcherKey);
      } catch (createError) {
        setError(String(createError));
      } finally {
        setCreatingSelection(null);
      }
    },
    [client, handleShowRuntimeTab, workspaceId],
  );

  const handleLaunchSurface = useCallback(
    (request: SurfaceLaunchRequest) => {
      switch (request.type) {
        case "terminal":
          void handleCreateTerminal(request);
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
        request: { type: "terminal", launchType: "shell" },
        loading: creatingSelection === "shell",
        disabled: creatingSelection !== null,
      },
      {
        key: "claude",
        title: "New Claude session",
        icon: <ClaudeIcon />,
        request: { type: "terminal", launchType: "harness", harnessProvider: "claude" as const },
        loading: creatingSelection === "claude",
        disabled: creatingSelection !== null,
      },
      {
        key: "codex",
        title: "New Codex session",
        icon: <CodexIcon />,
        request: { type: "terminal", launchType: "harness", harnessProvider: "codex" as const },
        loading: creatingSelection === "codex",
        disabled: creatingSelection !== null,
      },
    ],
    [creatingSelection],
  );

  const handleCloseRuntimeTab = useCallback(
    async (tabKey: string, terminalId: string) => {
      const launcherId = createWorkspaceLauncherId();
      const closePlan =
        state.activeTabKey === tabKey
          ? getWorkspaceTabClosePlan(visibleTabKeys, tabKey, `launcher:${launcherId}`)
          : {
              nextActiveKey: state.activeTabKey,
              openLauncher: false,
            };

      try {
        await detachTerminal(terminalId);
        client.invalidate(terminalKeys.byWorkspace(workspaceId));
        client.invalidate(terminalKeys.detail(terminalId));
        if (closePlan.openLauncher) {
          dispatch({
            launcherId,
            type: "open-launcher",
          });
        }
        dispatch({
          key: tabKey,
          nextActiveKey: closePlan.nextActiveKey,
          type: "hide-runtime-tab",
        });
      } catch (closeError) {
        setError(String(closeError));
      }
    },
    [client, state.activeTabKey, visibleTabKeys, workspaceId],
  );

  const handleCloseDocumentTab = useCallback(
    (tabKey: string) => {
      const launcherId = createWorkspaceLauncherId();
      const closePlan =
        state.activeTabKey === tabKey
          ? getWorkspaceTabClosePlan(visibleTabKeys, tabKey, `launcher:${launcherId}`)
          : {
              nextActiveKey: state.activeTabKey,
              openLauncher: false,
            };

      if (closePlan.openLauncher) {
        dispatch({
          launcherId,
          type: "open-launcher",
        });
      }
      dispatch({
        key: tabKey,
        nextActiveKey: closePlan.nextActiveKey,
        type: "close-document",
      });
    },
    [state.activeTabKey, visibleTabKeys],
  );

  const handleWorkspaceTabHotkeyAction = useCallback(
    (action: WorkspaceTabHotkeyAction) => {
      switch (action.type) {
        case "new-tab":
          handleOpenLauncher();
          return;
        case "close-active-tab": {
          if (!state.activeTabKey) {
            return;
          }

          const activeTab = visibleTabs.find((tab) => tab.key === state.activeTabKey);
          if (!activeTab) {
            return;
          }

          closeShortcutHandledAtRef.current = Date.now();
          if (activeTab.type === "terminal") {
            void handleCloseRuntimeTab(activeTab.key, activeTab.terminalId);
            return;
          }

          handleCloseDocumentTab(activeTab.key);
          return;
        }
        case "next-tab": {
          const nextKey = getWorkspaceAdjacentTabKey(visibleTabKeys, state.activeTabKey, "next");
          if (nextKey) {
            handleSelectTab(nextKey);
          }
          return;
        }
        case "previous-tab": {
          const previousKey = getWorkspaceAdjacentTabKey(
            visibleTabKeys,
            state.activeTabKey,
            "previous",
          );
          if (previousKey) {
            handleSelectTab(previousKey);
          }
          return;
        }
        case "select-tab-index": {
          const selectedKey = getWorkspaceTabKeyByIndex(visibleTabKeys, action.index);
          if (selectedKey) {
            handleSelectTab(selectedKey);
          }
        }
      }
    },
    [
      handleCloseDocumentTab,
      handleCloseRuntimeTab,
      handleOpenLauncher,
      handleSelectTab,
      state.activeTabKey,
      visibleTabKeys,
      visibleTabs,
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

      if (action.type === "close-active-tab") {
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
        if (action.type === "close-active-tab") {
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
          !state.activeTabKey ||
          visibleTabs.length === 0 ||
          !shouldTreatWindowCloseAsTabClose(closeShortcutTriggeredAtRef.current, now)
        ) {
          return;
        }

        closeShortcutTriggeredAtRef.current = 0;
        event.preventDefault();
        if (shouldTreatWindowCloseAsTabClose(closeShortcutHandledAtRef.current, now)) {
          return;
        }
        handleWorkspaceTabHotkeyAction({ type: "close-active-tab" });
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
  }, [handleWorkspaceTabHotkeyAction, state.activeTabKey, visibleTabs.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-1.5 pt-1 pb-3">
        <WorkspaceSurfaceTabBar
          activeTabKey={state.activeTabKey}
          onCloseDocumentTab={handleCloseDocumentTab}
          onCloseRuntimeTab={handleCloseRuntimeTab}
          onRenameRuntimeTab={(terminalId, label) => renameTerminal(terminalId, label)}
          onSelectTab={handleSelectTab}
          onSetTabOrder={(keys) => {
            dispatch({ keys, type: "set-tab-order" });
          }}
          renderTabLeading={(tab) => <WorkspaceSurfaceTabLeading tab={tab} />}
          visibleTabs={visibleTabs}
        />
        <SurfaceLaunchActions
          actions={surfaceActions}
          onLaunch={handleLaunchSurface}
          onOpenLauncher={handleOpenLauncher}
        />
      </div>

      {Boolean(terminalsQuery.error) && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Failed to load terminals: {String(terminalsQuery.error)}
        </div>
      )}
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <WorkspaceSurfacePanels
        activeTabKey={state.activeTabKey}
        activeTerminalId={activeTerminalId}
        creatingSelection={creatingSelection}
        documents={state.documents}
        hasVisibleTabs={visibleTabs.length > 0}
        onChangeFileDiffScope={(key, scope) => {
          dispatch({ key, scope, type: "change-scope" });
        }}
        onCreateTerminal={handleCreateTerminal}
        onOpenTerminal={handleShowRuntimeTab}
        sessionHistory={sessionHistory}
        terminals={terminals}
        waitingForActiveRuntimeTab={waitingForActiveRuntimeTab}
        workspaceId={workspaceId}
      />
    </div>
  );
}

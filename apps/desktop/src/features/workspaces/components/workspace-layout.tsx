import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getManifestFingerprint,
  type GitPullRequestSummary,
  type ServiceRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { notifyShellResizeListeners } from "../../../components/layout/shell-resize-provider";
import {
  DEFAULT_WORKSPACE_EXTENSION_PANEL_WIDTH,
  MAX_WORKSPACE_EXTENSION_PANEL_WIDTH,
  MIN_WORKSPACE_EXTENSION_PANEL_WIDTH,
  clampPanelSize,
  getRightSidebarWidthFromPointer,
  getSidebarWidthBounds,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "../../../lib/panel-layout";
import { OVERLAY_BOUNDARY_ATTRIBUTE } from "../../../lib/overlay-boundary";
import {
  readPersistedActiveExtensionId,
  WORKSPACE_EXTENSION_PANEL_WIDTH_STORAGE_KEY,
  writePersistedActiveExtensionId,
} from "../../extensions/extension-bar-state";
import type { WorkspaceExtensionLaunchActions } from "../../extensions/extension-bar-types";
import { ExtensionBar } from "../../extensions/extension-bar";
import { getBuiltinExtensionSlots } from "../../extensions/builtin-extensions";
import { ExtensionPanel } from "../../extensions/extension-panel";
import { useGitActions } from "../../git/hooks/use-git-actions";
import { useGitStatus } from "../../git/hooks";
import type { ManifestStatus } from "../../projects/api/projects";
import { WorkspaceCanvas } from "./workspace-canvas";
import {
  createChangesDiffOpenInput,
  createCommitDiffOpenInput,
  createFileViewerOpenInput,
  createPullRequestOpenInput,
} from "./workspace-canvas-requests";
import {
  syncWorkspaceManifest,
  startServices,
  stopWorkspace,
  updateWorkspaceService,
  type WorkspaceSnapshotResult,
} from "../api";
import { useWorkspaceEnvironmentTasks, useWorkspaceSetup } from "../hooks";
import { workspaceSupportsFilesystemInteraction } from "../lib/workspace-capabilities";
import { shouldSyncWorkspaceManifest } from "../lib/workspace-manifest-sync";
import { useWorkspaceOpenRequests } from "../state/workspace-open-requests";
import { useWorkspaceToolbar, type WorkspaceToolbarSlot } from "../state/workspace-toolbar-context";

const SIDEBAR_RESIZE_STEP = 16;

interface WorkspaceLayoutProps {
  workspace: WorkspaceRecord;
  workspaceSnapshot: WorkspaceSnapshotResult | null;
  manifestStatus: ManifestStatus | null;
  onCloseWorkspaceTab?: () => void;
}

export function WorkspaceLayout({
  workspace,
  workspaceSnapshot,
  manifestStatus,
  onCloseWorkspaceTab,
}: WorkspaceLayoutProps) {
  const workspaceLayoutRef = useRef<HTMLDivElement | null>(null);
  const [workspaceLayoutWidth, setWorkspaceLayoutWidth] = useState(0);
  const [panelWidth, setPanelWidth] = useState(() =>
    readPersistedPanelValue(
      WORKSPACE_EXTENSION_PANEL_WIDTH_STORAGE_KEY,
      DEFAULT_WORKSPACE_EXTENSION_PANEL_WIDTH,
    ),
  );
  const [activeExtensionId, setActiveExtensionId] = useState<string | null>(() =>
    readPersistedActiveExtensionId(workspace.id),
  );
  const [activePanelResize, setActivePanelResize] = useState(false);
  const { clearDocumentRequest, openDocument, requestsByWorkspaceId } = useWorkspaceOpenRequests();
  const openDocumentRequest = requestsByWorkspaceId[workspace.id] ?? null;
  const hasManifest = manifestStatus?.state === "valid";
  const config = hasManifest ? manifestStatus.result.config : null;
  const manifestState = manifestStatus?.state ?? "missing";
  const manifestFingerprint = config ? getManifestFingerprint(config) : null;
  const environmentTasksQuery = useWorkspaceEnvironmentTasks(workspace.id);
  const setupQuery = useWorkspaceSetup(workspace.id);
  const services = workspaceSnapshot?.services ?? [];
  const terminals = workspaceSnapshot?.terminals ?? [];
  const environmentTasks = environmentTasksQuery.data ?? [];
  const setupSteps = setupQuery.data ?? [];
  const supportsTerminalInteraction = workspaceSupportsFilesystemInteraction(workspace);
  const gitStatusQuery = useGitStatus(
    workspace.mode === "local" && workspace.worktree_path !== null ? workspace.id : null,
  );
  const { registerToolbarSlot, unregisterToolbarSlot } = useWorkspaceToolbar();

  const handleRun = useCallback(
    async (serviceNames?: string[]) => {
      if (!config) return;
      try {
        const manifestJson = JSON.stringify(config);
        await startServices({
          serviceNames,
          workspace,
          services,
          manifestJson,
          manifestFingerprint: getManifestFingerprint(config),
        });
      } catch (err) {
        console.error("Failed to start services:", err);
        throw err;
      }
    },
    [config, services, workspace],
  );

  const handleRestart = useCallback(async () => {
    if (!config) {
      return;
    }

    try {
      const manifestJson = JSON.stringify(config);
      await stopWorkspace(workspace.id);
      await startServices({
        workspace,
        services,
        manifestJson,
        manifestFingerprint: getManifestFingerprint(config),
      });
    } catch (err) {
      console.error("Failed to restart workspace:", err);
      throw err;
    }
  }, [config, services, workspace]);

  const handleStop = useCallback(async () => {
    try {
      await stopWorkspace(workspace.id);
    } catch (err) {
      console.error("Failed to stop workspace:", err);
      throw err;
    }
  }, [workspace.id]);

  const handleUpdateService = useCallback(
    async ({
      exposure,
      portOverride,
      serviceName,
    }: {
      exposure: ServiceRecord["exposure"];
      portOverride: number | null;
      serviceName: string;
    }) => {
      try {
        await updateWorkspaceService(workspace.id, serviceName, { exposure, portOverride });
      } catch (err) {
        console.error("Failed to update workspace service:", err);
        throw err;
      }
    },
    [workspace.id],
  );

  const isManifestStale =
    manifestState === "valid" &&
    manifestFingerprint !== null &&
    workspace.manifest_fingerprint !== null &&
    workspace.manifest_fingerprint !== undefined &&
    workspace.manifest_fingerprint !== manifestFingerprint;

  useEffect(() => {
    if (!shouldSyncWorkspaceManifest(workspace, manifestStatus, services.length)) {
      return;
    }

    const configToSync = manifestStatus?.state === "valid" ? manifestStatus.result.config : null;
    void (async () => {
      try {
        await syncWorkspaceManifest(workspace.id, configToSync);
      } catch (error) {
        console.error("Failed to sync workspace manifest:", error);
      }
    })();
  }, [manifestStatus, services.length, workspace]);

  const launchActions = useMemo<WorkspaceExtensionLaunchActions>(
    () => ({
      openChangesDiff: (focusPath) => {
        openDocument(workspace.id, createChangesDiffOpenInput(focusPath));
      },
      openCommitDiff: (entry) => {
        openDocument(workspace.id, createCommitDiffOpenInput(entry));
      },
      openFileViewer: (filePath) => {
        openDocument(workspace.id, createFileViewerOpenInput(filePath));
      },
      openPullRequest: (pullRequest: GitPullRequestSummary) => {
        if (supportsTerminalInteraction) {
          openDocument(workspace.id, createPullRequestOpenInput(pullRequest));
        } else {
          openUrl(pullRequest.url);
        }
      },
    }),
    [openDocument, supportsTerminalInteraction, workspace.id],
  );

  useEffect(() => {
    const workspaceLayout = workspaceLayoutRef.current;
    if (!workspaceLayout) {
      return;
    }

    const syncWidth = () => setWorkspaceLayoutWidth(workspaceLayout.getBoundingClientRect().width);

    syncWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);
      return () => window.removeEventListener("resize", syncWidth);
    }

    const observer = new ResizeObserver(() => syncWidth());
    observer.observe(workspaceLayout);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveExtensionId(readPersistedActiveExtensionId(workspace.id));
  }, [workspace.id]);

  useEffect(() => {
    writePersistedActiveExtensionId(workspace.id, activeExtensionId);
  }, [activeExtensionId, workspace.id]);

  const panelBounds = useMemo(
    () =>
      getSidebarWidthBounds({
        containerWidth: workspaceLayoutWidth,
        maxWidth: MAX_WORKSPACE_EXTENSION_PANEL_WIDTH,
        minWidth: MIN_WORKSPACE_EXTENSION_PANEL_WIDTH,
        oppositeSidebarWidth: 0,
      }),
    [workspaceLayoutWidth],
  );

  useEffect(() => {
    setPanelWidth((currentWidth) => {
      const nextWidth = clampPanelSize(currentWidth, panelBounds);
      return nextWidth === currentWidth ? currentWidth : nextWidth;
    });
  }, [panelBounds]);

  useEffect(() => {
    writePersistedPanelValue(
      WORKSPACE_EXTENSION_PANEL_WIDTH_STORAGE_KEY,
      clampPanelSize(panelWidth, panelBounds),
    );
  }, [panelBounds, panelWidth]);

  useEffect(() => {
    if (!activePanelResize) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const workspaceLayout = workspaceLayoutRef.current;
      if (!workspaceLayout) {
        return;
      }

      const bounds = workspaceLayout.getBoundingClientRect();
      setPanelWidth(getRightSidebarWidthFromPointer(event.clientX, bounds.right, panelBounds));
    };

    const handlePointerUp = () => {
      notifyShellResizeListeners(false);
      setActivePanelResize(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
    };
  }, [activePanelResize, panelBounds]);

  useEffect(() => {
    if (!activePanelResize) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [activePanelResize]);

  const handlePanelResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    notifyShellResizeListeners(true);
    setActivePanelResize(true);
  }, []);

  const handlePanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPanelWidth((currentWidth) =>
          clampPanelSize(currentWidth + SIDEBAR_RESIZE_STEP, panelBounds),
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPanelWidth((currentWidth) =>
          clampPanelSize(currentWidth - SIDEBAR_RESIZE_STEP, panelBounds),
        );
      }

      if (event.key === "Home") {
        event.preventDefault();
        setPanelWidth(panelBounds.minSize);
      }

      if (event.key === "End") {
        event.preventDefault();
        setPanelWidth(panelBounds.maxSize);
      }
    },
    [panelBounds],
  );

  const handleFocusTerminal = useCallback(
    (terminalId: string) => {
      window.dispatchEvent(
        new CustomEvent("lifecycle:focus-terminal", {
          detail: { workspaceId: workspace.id, terminalId },
        }),
      );
    },
    [workspace.id],
  );

  const extensionSlots = useMemo(
    () =>
      getBuiltinExtensionSlots({
        config,
        environmentTasks,
        gitStatus: gitStatusQuery.data,
        hasManifest,
        isManifestStale,
        launchActions,
        manifestState,
        onFocusTerminal: handleFocusTerminal,
        onRun: handleRun,
        onSwitchToExtension: (id) => setActiveExtensionId(id),
        onUpdateService: handleUpdateService,
        services,
        setupSteps,
        workspace,
      }),
    [
      config,
      environmentTasks,
      gitStatusQuery.data,
      handleFocusTerminal,
      handleRun,
      handleUpdateService,
      hasManifest,
      isManifestStale,
      launchActions,
      manifestState,
      services,
      setupSteps,
      workspace,
    ],
  );

  const activeExtensionSlot = useMemo(
    () => extensionSlots.find((slot) => slot.id === activeExtensionId) ?? null,
    [activeExtensionId, extensionSlots],
  );

  const handleSelectExtension = useCallback((extensionId: string) => {
    setActiveExtensionId(extensionId);
    setPanelCollapsed(false);
  }, []);

  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    const handleTogglePanel = () => {
      setPanelCollapsed((current) => !current);
    };

    window.addEventListener("lifecycle:toggle-extension-panel", handleTogglePanel);
    return () => window.removeEventListener("lifecycle:toggle-extension-panel", handleTogglePanel);
  }, []);

  const handleToolbarCommitComplete = useCallback(() => {
    setActiveExtensionId("git-history");
  }, []);

  // Git actions for toolbar
  const gitActions = useGitActions({
    onCommitComplete: handleToolbarCommitComplete,
    onOpenPullRequest: launchActions.openPullRequest,
    workspaceId: workspace.id,
    workspaceMode: workspace.mode,
    worktreePath: workspace.worktree_path,
  });

  // Derive run/stop action state for toolbar
  const canRun = workspace.status === "idle" && hasManifest;
  const canStop = workspace.status === "active" || workspace.status === "starting";
  const canRestart = workspace.status === "active" && hasManifest;
  const stopping = workspace.status === "stopping";
  const [runActionActive, setRunActionActive] = useState<"restart" | "start" | "stop" | null>(null);

  const toolbarRunAction = useMemo(() => {
    const actionDisabled = runActionActive !== null || stopping || (!canRun && !canStop);

    if (canStop || stopping || workspace.status === "starting") {
      const label =
        workspace.status === "starting"
          ? "Starting..."
          : runActionActive === "stop" || stopping
            ? "Stopping..."
            : "Stop";
      return {
        label,
        disabled: actionDisabled,
        loading: workspace.status === "starting",
        onClick: () => {
          if (actionDisabled) return;
          setRunActionActive("stop");
          void handleStop()
            .catch((err) => console.error("Failed to stop:", err))
            .finally(() => setRunActionActive(null));
        },
      };
    }

    return {
      label: runActionActive === "start" ? "Starting..." : "Start",
      disabled: actionDisabled,
      loading: runActionActive === "start",
      onClick: () => {
        if (actionDisabled) return;
        setRunActionActive("start");
        void handleRun()
          .catch((err) => console.error("Failed to start:", err))
          .finally(() => setRunActionActive(null));
      },
    };
  }, [canRun, canStop, handleRun, handleStop, runActionActive, stopping, workspace.status]);

  const toolbarRestartAction = useMemo(() => {
    if (!canRestart) return null;
    return {
      disabled: runActionActive !== null,
      onClick: () => {
        setRunActionActive("restart");
        void handleRestart()
          .catch((err) => console.error("Failed to restart:", err))
          .finally(() => setRunActionActive(null));
      },
    };
  }, [canRestart, handleRestart, runActionActive]);

  const toolbarGitActionProps = useMemo(
    () => ({
      actionError: gitActions.actionError,
      branchPullRequest: gitActions.branchPullRequest ?? null,
      gitStatus: gitActions.gitStatus ?? null,
      variant: "outline" as const,
      isCommitting: gitActions.isCommitting,
      isCreatingPullRequest: gitActions.isCreatingPullRequest,
      isLoading: gitActions.isLoading,
      isMergingPullRequest: gitActions.isMergingPullRequest,
      isPushingBranch: gitActions.isPushingBranch,
      onCommit: gitActions.handleCommit,
      onCreatePullRequest: gitActions.handleCreatePullRequest,
      onMergePullRequest: gitActions.handleMergePullRequest,
      onOpenPullRequest: launchActions.openPullRequest,
      onPushBranch: gitActions.handlePushBranch,
      onShowChanges: gitActions.handleShowChanges,
    }),
    [
      gitActions.actionError,
      gitActions.branchPullRequest,
      gitActions.gitStatus,
      gitActions.handleCommit,
      gitActions.handleCreatePullRequest,
      gitActions.handleMergePullRequest,
      gitActions.handlePushBranch,
      gitActions.handleShowChanges,
      gitActions.isCommitting,
      gitActions.isCreatingPullRequest,
      gitActions.isLoading,
      gitActions.isMergingPullRequest,
      gitActions.isPushingBranch,
      launchActions.openPullRequest,
    ],
  );

  const toolbarSlot = useMemo<WorkspaceToolbarSlot>(
    () => ({
      runAction: toolbarRunAction,
      restartAction: toolbarRestartAction,
      gitActionProps: toolbarGitActionProps,
    }),
    [toolbarGitActionProps, toolbarRestartAction, toolbarRunAction],
  );

  // Register toolbar slot
  useEffect(() => {
    registerToolbarSlot(workspace.id, toolbarSlot);
  }, [registerToolbarSlot, toolbarSlot, workspace.id]);

  useEffect(() => {
    return () => {
      unregisterToolbarSlot(workspace.id);
    };
  }, [unregisterToolbarSlot, workspace.id]);

  const canvasContent = supportsTerminalInteraction ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceCanvas
          key={workspace.id}
          openDocumentRequest={openDocumentRequest}
          onCloseWorkspaceTab={onCloseWorkspaceTab}
          onOpenDocumentRequestHandled={(requestId) =>
            clearDocumentRequest(workspace.id, requestId)
          }
          snapshotTerminals={terminals}
          workspaceId={workspace.id}
        />
      </div>
    </div>
  ) : (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl">
        <EmptyState
          description="Use the Environment panel for lifecycle state and setup details until this workspace exposes an interactive surface."
          title="Workspace surface unavailable"
        />
      </div>
    </div>
  );

  return (
    <div
      ref={workspaceLayoutRef}
      className="relative flex min-h-0 flex-1 overflow-hidden"
      {...{ [OVERLAY_BOUNDARY_ATTRIBUTE]: "" }}
      data-slot="workspace-layout"
    >
      <div
        className="workspace-canvas-grid relative flex min-w-0 flex-1 flex-col"
        data-slot="workspace-canvas"
      >
        {canvasContent}
      </div>
      {!panelCollapsed && (
        <div
          className="relative z-[1] flex shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]"
          style={activeExtensionSlot ? { width: `${panelWidth}px` } : undefined}
        >
          {activeExtensionSlot && (
            <div
              aria-label="Resize extension panel"
              aria-orientation="vertical"
              aria-valuemax={panelBounds.maxSize}
              aria-valuemin={panelBounds.minSize}
              aria-valuenow={panelWidth}
              className="absolute inset-y-0 -left-2 z-20 w-4 cursor-col-resize"
              onKeyDown={handlePanelResizeKeyDown}
              onPointerDown={handlePanelResizePointerDown}
              role="separator"
              tabIndex={0}
            />
          )}
          <ExtensionBar
            activeExtensionId={activeExtensionId}
            onSelectExtension={handleSelectExtension}
            slots={extensionSlots}
          />
          {activeExtensionSlot && <ExtensionPanel activeSlot={activeExtensionSlot} />}
        </div>
      )}
    </div>
  );
}

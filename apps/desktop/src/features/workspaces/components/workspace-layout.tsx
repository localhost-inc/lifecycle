import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getManifestFingerprint,
  type GitPullRequestSummary,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { Alert, AlertDescription, AlertTitle, EmptyState, Loading } from "@lifecycle/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { notifyShellResizeListeners } from "@/components/layout/shell-resize-provider";
import {
  DEFAULT_WORKSPACE_EXTENSION_PANEL_WIDTH,
  MAX_WORKSPACE_EXTENSION_PANEL_WIDTH,
  MIN_WORKSPACE_EXTENSION_PANEL_WIDTH,
  clampPanelSize,
  getRightSidebarWidthFromPointer,
  getSidebarWidthBounds,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "@/lib/panel-layout";
import { OVERLAY_BOUNDARY_ATTRIBUTE } from "@/lib/overlay-boundary";
import { toErrorEnvelope } from "@/lib/tauri-error";
import {
  readPersistedActiveExtensionId,
  WORKSPACE_EXTENSION_PANEL_WIDTH_STORAGE_KEY,
  writePersistedActiveExtensionId,
} from "@/features/extensions/extension-bar-state";
import type { WorkspaceExtensionLaunchActions } from "@/features/extensions/extension-bar-types";
import { ExtensionBar } from "@/features/extensions/extension-bar";
import { getBuiltinExtensionSlots } from "@/features/extensions/builtin-extensions";
import { ExtensionPanel } from "@/features/extensions/extension-panel";
import { useGitStatus } from "@/features/git/hooks";
import type { ManifestStatus } from "@/features/projects/api/projects";
import { hasBlockingQueryError, hasBlockingQueryLoad } from "@/features/workspaces/routes/workspace-route-query-state";
import { WorkspaceCanvas } from "@/features/workspaces/components/workspace-canvas";
import {
  createChangesDiffOpenInput,
  createCommitDiffOpenInput,
  createFileViewerOpenInput,
  createPullRequestOpenInput,
} from "@/features/workspaces/components/workspace-canvas-requests";
import {
  startServices,
  stopWorkspace,
} from "@/features/workspaces/api";
import { useWorkspaceEnvironment, useWorkspaceServices } from "@/features/workspaces/hooks";
import { workspaceSupportsFilesystemInteraction } from "@/features/workspaces/lib/workspace-capabilities";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";

const SIDEBAR_RESIZE_STEP = 16;

interface WorkspaceLayoutProps {
  workspace: WorkspaceRecord;
  manifestStatus: ManifestStatus | null;
  onCloseWorkspaceTab?: () => void;
}

export function WorkspaceLayout({
  workspace,
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const { clearDocumentRequest, openDocument, requestsByWorkspaceId } = useWorkspaceOpenRequests();
  const openDocumentRequest = requestsByWorkspaceId[workspace.id] ?? null;
  const hasManifest = manifestStatus?.state === "valid";
  const config = hasManifest ? manifestStatus.result.config : null;
  const manifestState = manifestStatus?.state ?? "missing";
  const supportsTerminalInteraction = workspaceSupportsFilesystemInteraction(workspace);
  const environmentQuery = useWorkspaceEnvironment(workspace.id);
  const servicesQuery = useWorkspaceServices(workspace.id);
  const gitStatusQuery = useGitStatus(
    workspace.mode === "local" && workspace.worktree_path !== null ? workspace.id : null,
  );

  const environment = environmentQuery.data;
  const services = servicesQuery.data;

  const handleRun = useCallback(
    async (serviceNames?: string[]) => {
      if (!config || !services) return;
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
    if (!config || !services) {
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
      environment && services
        ? getBuiltinExtensionSlots({
            config,
            environment,
            gitStatus: gitStatusQuery.data,
            hasManifest,
            launchActions,
            manifestState,
            onFocusTerminal: handleFocusTerminal,
            onRestart: handleRestart,
            onRun: handleRun,
            onStop: handleStop,
            onSwitchToExtension: (id) => setActiveExtensionId(id),
            services,
            workspace,
          })
        : [],
    [
      config,
      environment,
      gitStatusQuery.data,
      handleFocusTerminal,
      handleRestart,
      handleRun,
      handleStop,
      hasManifest,
      launchActions,
      manifestState,
      services,
      workspace,
    ],
  );

  // Default to first extension when no active extension is persisted (e.g. new workspace)
  useEffect(() => {
    const first = extensionSlots[0];
    if (activeExtensionId === null && first) {
      setActiveExtensionId(first.id);
    }
  }, [activeExtensionId, extensionSlots]);

  const activeExtensionSlot = useMemo(
    () => extensionSlots.find((slot) => slot.id === activeExtensionId) ?? null,
    [activeExtensionId, extensionSlots],
  );

  const handleSelectExtension = useCallback((extensionId: string) => {
    setActiveExtensionId(extensionId);
    setPanelCollapsed(false);
  }, []);

  useEffect(() => {
    const handleTogglePanel = () => {
      setPanelCollapsed((current) => !current);
    };

    window.addEventListener("lifecycle:toggle-extension-panel", handleTogglePanel);
    return () => window.removeEventListener("lifecycle:toggle-extension-panel", handleTogglePanel);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lifecycle:extension-panel-state", {
        detail: { collapsed: panelCollapsed },
      }),
    );
  }, [panelCollapsed]);

  // — Early returns (after all hooks to preserve hook order) —

  if (hasBlockingQueryLoad(environmentQuery) || hasBlockingQueryLoad(servicesQuery)) {
    return <Loading delay={0} message="Loading workspace environment..." />;
  }

  if (hasBlockingQueryError(environmentQuery)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Failed to load environment</AlertTitle>
          <AlertDescription>{toErrorEnvelope(environmentQuery.error).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (hasBlockingQueryError(servicesQuery)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Failed to load services</AlertTitle>
          <AlertDescription>{toErrorEnvelope(servicesQuery.error).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (environment === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Workspace environment missing</AlertTitle>
          <AlertDescription>
            Every workspace must have exactly one environment.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (services === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Workspace services missing</AlertTitle>
          <AlertDescription>Service state could not be resolved for this environment.</AlertDescription>
        </Alert>
      </div>
    );
  }

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
          workspaceId={workspace.id}
        />
      </div>
    </div>
  ) : (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl">
        <EmptyState
          description="Use the Environment panel for lifecycle state and preparation details until this workspace exposes an interactive surface."
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

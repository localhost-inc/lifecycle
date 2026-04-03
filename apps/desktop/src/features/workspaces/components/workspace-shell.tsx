import { openUrl } from "@tauri-apps/plugin-opener";
import { type GitPullRequestSummary, type WorkspaceRecord } from "@lifecycle/contracts";
import { createStartStackInput, previewUrlForService } from "@lifecycle/stack";
import { useStackClient } from "@lifecycle/stack/react";
import type { ManifestStatus } from "@lifecycle/workspace";
import { workspaceHostLabel } from "@lifecycle/workspace";
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
import { WorkspaceCanvas } from "@/features/workspaces/canvas/workspace-canvas";
import {
  createAgentOpenInput,
  createChangesDiffOpenInput,
  createCommitDiffOpenInput,
  createFileEditorOpenInput,
  createPreviewOpenInput,
  createPullRequestOpenInput,
} from "@/features/workspaces/canvas/workspace-canvas-requests";
import { workspaceSupportsFilesystemInteraction } from "@/features/workspaces/lib/workspace-capabilities";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";
import { useWorkspaceToolbar } from "@/features/workspaces/state/workspace-toolbar-context";
import { invokeTauri } from "@/lib/tauri-error";
import { useStoreContext, useWorkspaceServices } from "@/store";

const SIDEBAR_RESIZE_STEP = 16;

interface WorkspaceShellProps {
  workspace: WorkspaceRecord;
  manifestStatus: ManifestStatus | null;
  onCloseTab?: () => void;
}

export function WorkspaceShell({ workspace, manifestStatus, onCloseTab }: WorkspaceShellProps) {
  const environmentClient = useStackClient();
  const { collections } = useStoreContext();
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
  const { clearTabRequest, openTab, requestsByWorkspaceId } = useWorkspaceOpenRequests();
  const openTabRequest = requestsByWorkspaceId[workspace.id] ?? null;
  const hasManifest = manifestStatus?.state === "valid";
  const config = hasManifest ? manifestStatus.result.config : null;
  const manifestState = manifestStatus?.state ?? "missing";
  const supportsTerminalInteraction = workspaceSupportsFilesystemInteraction(workspace);
  const services = useWorkspaceServices(workspace.id);
  const gitStatusQuery = useGitStatus(supportsTerminalInteraction ? workspace.id : null);
  const { registerToolbarSlot, unregisterToolbarSlot } = useWorkspaceToolbar();

  // Reset stale service statuses on mount. After an app restart the process
  // manager is empty, but service records may still show "ready"/"starting"
  // from the previous session. Kill orphaned processes before resetting state
  // so a subsequent Start doesn't conflict with the old instances.
  //
  // We include `services` in the dep array so the effect re-runs once the
  // collection hydrates from SQLite (the first render often has an empty array).
  // `staleResetRef` ensures we only act once.
  const staleResetRef = useRef(false);
  useEffect(() => {
    if (staleResetRef.current) return;

    // Wait until the collection has hydrated — don't commit to "nothing stale"
    // when services simply haven't loaded yet.
    if (services.length === 0) return;

    staleResetRef.current = true;

    const staleNames = services
      .filter((s) => s.status === "ready" || s.status === "starting")
      .map((s) => s.name);
    if (staleNames.length === 0) return;

    void environmentClient.stop(workspace.id, staleNames, workspaceHostLabel(workspace)).finally(() => {
      const now = new Date().toISOString();
      for (const service of services) {
        if (service.status === "ready" || service.status === "starting") {
          collections.services.update(service.id, (draft) => {
            draft.status = "stopped";
            draft.status_reason = null;
            draft.assigned_port = null;
            draft.preview_url = null;
            draft.updated_at = now;
          });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  const persistPreparedAt = useCallback(
    async (preparedAt: string | null): Promise<void> => {
      if (!preparedAt || workspace.prepared_at === preparedAt) {
        return;
      }

      const transaction = collections.workspaces.update(workspace.id, (draft) => {
        draft.prepared_at = preparedAt;
        draft.updated_at = preparedAt;
      });
      await transaction.isPersisted.promise;
    },
    [collections.workspaces, workspace.id, workspace.prepared_at],
  );

  const handleRun = useCallback(
    async (serviceNames?: string[]) => {
      if (!config || !services) return;

      const serviceByName = new Map(services.map((s) => [s.name, s]));
      const hostLabel = workspaceHostLabel(workspace);
      let proxyPort: number | null = null;

      const input = createStartStackInput({
        hostLabel,
        serviceNames,
        services,
        workspace,
      });

      input.callbacks = {
        onServiceStarting: (name) => {
          const service = serviceByName.get(name);
          if (!service) return;
          collections.services.update(service.id, (draft) => {
            draft.status = "starting";
            draft.updated_at = new Date().toISOString();
          });
        },
        onServiceReady: (started) => {
          const service = serviceByName.get(started.name);
          if (!service) return;
          const previewUrl =
            started.assignedPort !== null && proxyPort !== null
              ? previewUrlForService(hostLabel, started.name, proxyPort)
              : null;
          collections.services.update(service.id, (draft) => {
            draft.status = "ready";
            draft.status_reason = null;
            draft.assigned_port = started.assignedPort;
            draft.preview_url = previewUrl;
            draft.updated_at = new Date().toISOString();
          });
        },
        onServiceFailed: (name) => {
          const service = serviceByName.get(name);
          if (!service) return;
          collections.services.update(service.id, (draft) => {
            draft.status = "failed";
            draft.status_reason = "service_start_failed";
            draft.updated_at = new Date().toISOString();
          });
        },
      };

      try {
        proxyPort = await invokeTauri<number>("get_preview_proxy_port");
        const result = await environmentClient.start(config, input);
        await persistPreparedAt(result.preparedAt);
      } catch (err) {
        console.error("Failed to start services:", err);
        throw err;
      }
    },
    [collections.services, config, environmentClient, persistPreparedAt, services, workspace],
  );

  const handleRestart = useCallback(async () => {
    if (!config || !services) {
      return;
    }

    try {
      await environmentClient.stop(
        workspace.id,
        services.map((service) => service.name),
        workspaceHostLabel(workspace),
      );
      const result = await environmentClient.start(
        config,
        createStartStackInput({
          hostLabel: workspaceHostLabel(workspace),
          services,
          workspace,
        }),
      );
      await persistPreparedAt(result.preparedAt);
    } catch (err) {
      console.error("Failed to restart workspace:", err);
      throw err;
    }
  }, [config, environmentClient, persistPreparedAt, services, workspace]);

  const handleStop = useCallback(async () => {
    try {
      await environmentClient.stop(
        workspace.id,
        services.map((service) => service.name),
        workspaceHostLabel(workspace),
      );

      const now = new Date().toISOString();
      for (const service of services) {
        if (service.status === "ready" || service.status === "starting") {
          collections.services.update(service.id, (draft) => {
            draft.status = "stopped";
            draft.status_reason = null;
            draft.assigned_port = null;
            draft.preview_url = null;
            draft.updated_at = now;
          });
        }
      }
    } catch (err) {
      console.error("Failed to stop workspace:", err);
      throw err;
    }
  }, [collections.services, environmentClient, services, workspace.id]);

  // ---------------------------------------------------------------------------
  // Toolbar slot — surfaces run + git actions in the workspace nav bar
  // ---------------------------------------------------------------------------

  const [runActionBusy, setRunActionBusy] = useState(false);

  const toolbarRunAction = useMemo(() => {
    if (!hasManifest) return null;
    const workspaceStatus = workspace.status;
    const hasStartingService = services?.some((s) => s.status === "starting") ?? false;
    const hasReadyService = services?.some((s) => s.status === "ready") ?? false;
    const canRun = workspaceStatus === "active" && !hasStartingService && !hasReadyService;
    const canStop = workspaceStatus === "active" && (hasStartingService || hasReadyService);
    const isProvisioning = workspaceStatus === "provisioning";
    const isArchiving = workspaceStatus === "archiving";
    const disabled = runActionBusy || isProvisioning || isArchiving || (!canRun && !canStop);
    const label = isProvisioning
      ? "Provisioning..."
      : isArchiving
        ? "Archiving..."
        : runActionBusy && canStop
          ? "Stopping..."
          : canStop
            ? "Stop"
            : runActionBusy
              ? "Starting..."
              : "Start";

    return {
      label,
      disabled,
      loading: runActionBusy,
      onClick: () => {
        if (runActionBusy) return;
        setRunActionBusy(true);
        (canStop ? handleStop() : canRun ? handleRun() : Promise.resolve())
          .catch((err) => console.error("Run action failed:", err))
          .finally(() => setRunActionBusy(false));
      },
    };
  }, [handleRun, handleStop, hasManifest, runActionBusy, services, workspace.status]);

  const toolbarRestartAction = useMemo(() => {
    const hasReadyService = services?.some((s) => s.status === "ready") ?? false;
    if (!hasManifest || !hasReadyService) return null;
    return {
      disabled: runActionBusy,
      onClick: () => {
        if (runActionBusy) return;
        setRunActionBusy(true);
        handleRestart()
          .catch((err) => console.error("Restart failed:", err))
          .finally(() => setRunActionBusy(false));
      },
    };
  }, [handleRestart, hasManifest, runActionBusy, services]);

  const launchActions = useMemo<WorkspaceExtensionLaunchActions>(
    () => ({
      openAgentSession: (session) => {
        openTab(
          workspace.id,
          createAgentOpenInput({
            agentSessionId: session.id,
            provider: session.provider,
            label: session.title,
          }),
        );
      },
      openPreview: (service) => {
        if (!service.preview_url) {
          return;
        }

        openTab(
          workspace.id,
          createPreviewOpenInput({
            label: service.name,
            previewKey: `service:${service.name}`,
            url: service.preview_url,
          }),
        );
      },
      openChangesDiff: (focusPath) => {
        openTab(workspace.id, createChangesDiffOpenInput(focusPath));
      },
      openCommitDiff: (entry) => {
        openTab(workspace.id, createCommitDiffOpenInput(entry));
      },
      openFileEditor: (filePath) => {
        openTab(workspace.id, createFileEditorOpenInput(filePath));
      },
      openPullRequest: (pullRequest: GitPullRequestSummary) => {
        if (supportsTerminalInteraction) {
          openTab(workspace.id, createPullRequestOpenInput(pullRequest));
        } else {
          openUrl(pullRequest.url);
        }
      },
    }),
    [openTab, supportsTerminalInteraction, workspace.id],
  );

  const toolbarGitAction = useMemo(() => {
    if (!supportsTerminalInteraction) return null;
    return {
      workspaceId: workspace.id,
      worktreePath: workspace.worktree_path,
      onOpenPullRequest: (pr: GitPullRequestSummary) => {
        launchActions.openPullRequest(pr);
      },
    };
  }, [launchActions, supportsTerminalInteraction, workspace.id, workspace.worktree_path]);

  useEffect(() => {
    registerToolbarSlot(workspace.id, {
      runAction: toolbarRunAction,
      restartAction: toolbarRestartAction,
      gitAction: toolbarGitAction,
    });
    return () => unregisterToolbarSlot(workspace.id);
  }, [
    registerToolbarSlot,
    toolbarGitAction,
    toolbarRestartAction,
    toolbarRunAction,
    unregisterToolbarSlot,
    workspace.id,
  ]);

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

  const extensionSlots = useMemo(
    () =>
      services
        ? getBuiltinExtensionSlots({
            config,
            gitStatus: gitStatusQuery.data,
            hasManifest,
            launchActions,
            manifestState,
            onRun: handleRun,
            onSwitchToExtension: (id) => setActiveExtensionId(id),
            services,
            workspace,
          })
        : [],
    [
      config,
      gitStatusQuery.data,
      handleRun,
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

  // Services are loaded from TanStack DB collection (always available as an array)

  const canvasContent = supportsTerminalInteraction ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceCanvas
          key={workspace.id}
          openTabRequest={openTabRequest}
          onCloseTab={onCloseTab}
          onOpenTabRequestHandled={(requestId) => clearTabRequest(workspace.id, requestId)}
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
      data-slot="workspace-shell"
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
          style={activeExtensionSlot ? { width: `${panelWidth / 16}rem` } : undefined}
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

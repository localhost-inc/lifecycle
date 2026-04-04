import { useAuthSession } from "@lifecycle/auth/react";
import {
  getManifestFingerprint,
  type WorkspaceCheckoutType,
  type WorkspaceHost,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { useWorkspaceClientRegistry } from "@lifecycle/workspace/react";
import { Loading } from "@lifecycle/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AppHotkeyListener } from "@/app/app-hotkey-listener";
import { isMacPlatform, shouldHandleDomAppHotkey } from "@/app/app-hotkeys";
import { useAgentStatusIndex } from "@lifecycle/agents/react";
import { CommandPaletteProvider } from "@/features/command-palette";
import { useRepositoryCatalog } from "@/features/repositories/hooks";
import { useRepositoryMutations } from "@/features/repositories/mutations";
import {
  buildShellContexts,
  filterRepositoriesForShellContext,
  readPersistedShellContextId,
  resolveActiveShellContext,
  writePersistedShellContextId,
} from "@/features/repositories/lib/shell-context";
import { WelcomeScreen } from "@/features/welcome/components/welcome-screen";
import type { WorkspaceCreateMode } from "@/features/workspaces/types";
import { getWorkspaceDisplayName } from "@/features/workspaces/lib/workspace-display";
import { formatWorkspaceError } from "@/features/workspaces/lib/workspace-errors";
import {
  clearLastRepositoryId,
  clearLastRepositorySubPath,
  readLastRepositoryId,
  readLastRepositorySubPath,
  writeLastRepositoryId,
} from "@/features/repositories/state/repository-content-tabs";
import {
  clearLastWorkspaceId,
  clearWorkspaceCanvasState,
  readLastWorkspaceId,
  writeLastWorkspaceId,
} from "@/features/workspaces/state/workspace-canvas-state";
import { DesktopRpcListener } from "@/features/workspaces/state/desktop-rpc-listener";
import { WorkspaceOpenRequestsProvider } from "@/features/workspaces/state/workspace-open-requests";
import { WorkspaceToolbarProvider } from "@/features/workspaces/state/workspace-toolbar-context";
import {
  APP_SIDEBAR_WIDTH_STORAGE_KEY,
  DEFAULT_APP_SIDEBAR_WIDTH,
  MAX_APP_SIDEBAR_WIDTH,
  MIN_APP_SIDEBAR_WIDTH,
  clampPanelSize,
  getLeftSidebarWidthFromPointer,
  getSidebarWidthBounds,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "@/lib/panel-layout";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";
import { type AppShellOutletContext } from "@/components/layout/app-shell-context";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  notifyShellResizeListeners,
  ShellResizeProvider,
} from "@/components/layout/shell-resize-provider";
import { autoWorkspaceName, workspaceBranchName } from "@lifecycle/workspace";
import { selectRepositoryById, selectServicesByWorkspace } from "@lifecycle/store";
import { waitForDbReady } from "@/lib/db";
import { useStoreContext, useWorkspacesByRepository } from "@/store";

const SIDEBAR_RESIZE_STEP = 16;

function safeClearWorkspaceUiState(workspaceId: string): void {
  try {
    clearWorkspaceCanvasState(workspaceId);
  } catch {
    // best-effort cleanup
  }
}

const LAST_PATH_STORAGE_KEY = "lifecycle.desktop.last-path";

export function AppShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { repositoryId } = useParams();
  const { collections, driver } = useStoreContext();
  const shellViewportRef = useRef<HTMLDivElement | null>(null);
  const repositoryCatalogQuery = useRepositoryCatalog();
  const { createRepositoryFromDirectory, removeRepository } = useRepositoryMutations();
  const workspaceClientRegistry = useWorkspaceClientRegistry();
  const workspacesByRepository = useWorkspacesByRepository();
  const { isLoading: authSessionLoading, session: authSession } = useAuthSession();
  const agentStatusIndex = useAgentStatusIndex();
  const hasWorkspaceResponseReady = useCallback(
    (workspaceId: string) => agentStatusIndex.hasWorkspaceResponseReady(workspaceId),
    [agentStatusIndex],
  );
  const hasWorkspaceRunningTurn = useCallback(
    (workspaceId: string) => agentStatusIndex.hasWorkspaceRunningTurn(workspaceId),
    [agentStatusIndex],
  );
  const [requestedShellContextId, setRequestedShellContextId] = useState<string | null>(
    readPersistedShellContextId,
  );
  const [shellViewportWidth, setShellViewportWidth] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readPersistedPanelValue(APP_SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_APP_SIDEBAR_WIDTH),
  );
  const [activeSidebarResize, setActiveSidebarResize] = useState(false);
  const allRepositories = repositoryCatalogQuery.data?.repositories ?? [];
  const shellContexts = useMemo(
    () =>
      buildShellContexts(allRepositories, {
        personalContextPersisted: authSession.state === "logged_in",
        personalDisplayName: authSession.identity?.displayName,
      }),
    [allRepositories, authSession.state, authSession.identity?.displayName],
  );
  const activeShellContext = useMemo(
    () =>
      resolveActiveShellContext({
        contexts: shellContexts,
        repositories: allRepositories,
        requestedContextId: requestedShellContextId,
        routeRepositoryId: repositoryId,
      }),
    [allRepositories, repositoryId, requestedShellContextId, shellContexts],
  );
  const repositories = useMemo(
    () => filterRepositoriesForShellContext(allRepositories, activeShellContext),
    [activeShellContext, allRepositories],
  );
  const rawWorkspacesByRepositoryId: Record<string, WorkspaceRecord[]> = workspacesByRepository;
  const workspacesByRepositoryId = useMemo((): Record<string, WorkspaceRecord[]> => {
    const visibleRepositoryIds = new Set(repositories.map((repository) => repository.id));
    return Object.fromEntries(
      Object.entries(rawWorkspacesByRepositoryId).filter(([candidateRepositoryId]) =>
        visibleRepositoryIds.has(candidateRepositoryId),
      ),
    );
  }, [repositories, rawWorkspacesByRepositoryId]);
  const visibleRepositoryCatalog = useMemo(() => {
    if (!repositoryCatalogQuery.data) {
      return undefined;
    }

    const visibleRepositoryIds = new Set(repositories.map((repository) => repository.id));
    return {
      manifestsByRepositoryId: Object.fromEntries(
        Object.entries(repositoryCatalogQuery.data.manifestsByRepositoryId).filter(
          ([candidateRepositoryId]) => visibleRepositoryIds.has(candidateRepositoryId),
        ),
      ),
      repositories,
    };
  }, [repositoryCatalogQuery.data, repositories]);
  const readyRepositoryIds = useMemo(
    () =>
      new Set(
        repositories.flatMap((repository) =>
          (workspacesByRepositoryId[repository.id] ?? []).some((workspace) =>
            hasWorkspaceResponseReady(workspace.id),
          )
            ? [repository.id]
            : [],
        ),
      ),
    [hasWorkspaceResponseReady, repositories, workspacesByRepositoryId],
  );
  const sidebarBounds = useMemo(
    () =>
      getSidebarWidthBounds({
        containerWidth: shellViewportWidth,
        maxWidth: MAX_APP_SIDEBAR_WIDTH,
        minWidth: MIN_APP_SIDEBAR_WIDTH,
        oppositeSidebarWidth: 0,
      }),
    [shellViewportWidth],
  );

  const createWorkspaceForRepository = useCallback(
    async (input: {
      checkoutType: WorkspaceCheckoutType;
      host: WorkspaceHost;
      repositoryId: string;
      workspaceName?: string;
    }): Promise<string> => {
      await waitForDbReady();

      const repository = await selectRepositoryById(driver, input.repositoryId);
      if (!repository) {
        throw new Error(`Repository "${input.repositoryId}" was not found.`);
      }

      const workspaceClient = workspaceClientRegistry.resolve(input.host);
      const manifestStatus = await workspaceClient.readManifest(repository.path);
      const manifestJson =
        manifestStatus.state === "valid" ? JSON.stringify(manifestStatus.result.config) : undefined;
      const manifestFingerprint =
        manifestStatus.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;
      const currentBranch = await workspaceClient.getGitCurrentBranch(repository.path);

      const workspaceId = crypto.randomUUID();
      const checkoutType = input.checkoutType;
      const isRoot = checkoutType === "root";
      const branch = currentBranch ?? "main";
      const name = input.workspaceName?.trim() || (isRoot ? branch : autoWorkspaceName(workspaceId));
      const sourceRef = isRoot ? branch : workspaceBranchName(name, workspaceId);

      const now = new Date().toISOString();
      const transaction = collections.workspaces.insert(
        {
          id: workspaceId,
          repository_id: repository.id,
          name,
          checkout_type: checkoutType,
          source_ref: sourceRef,
          git_sha: null,
          worktree_path: null,
          host: input.host,
          manifest_fingerprint: manifestFingerprint,
          created_at: now,
          updated_at: now,
          last_active_at: now,
          prepared_at: null,
          status: "provisioning",
          failure_reason: null,
          failed_at: null,
        },
        {
          metadata: {
            nameOrigin: isRoot || input.workspaceName ? "manual" : "default",
            sourceRefOrigin: isRoot ? "manual" : "default",
          },
        },
      );
      await transaction.isPersisted.promise;
      return workspaceId;
    },
    [collections.workspaces, driver, workspaceClientRegistry],
  );

  const inspectArchive = useCallback(
    async (workspace: WorkspaceRecord) => {
      return workspaceClientRegistry.resolve(workspace.host).inspectArchive(workspace);
    },
    [workspaceClientRegistry],
  );

  const archiveWorkspace = useCallback(
    async (workspace: WorkspaceRecord): Promise<void> => {
      const repository = await selectRepositoryById(driver, workspace.repository_id);
      if (!repository) {
        throw new Error(`Repository "${workspace.repository_id}" was not found.`);
      }

      await workspaceClientRegistry.resolve(workspace.host).archiveWorkspace({
        workspace,
        projectPath: repository.path,
      });

      const services = await selectServicesByWorkspace(driver, workspace.id);
      for (const service of services) {
        const serviceTx = collections.services.delete(service.id);
        await serviceTx.isPersisted.promise;
      }
      const workspaceTx = collections.workspaces.delete(workspace.id);
      await workspaceTx.isPersisted.promise;
    },
    [collections.services, collections.workspaces, driver, workspaceClientRegistry],
  );

  useEffect(() => {
    const shellViewport = shellViewportRef.current;
    if (!shellViewport) {
      return;
    }

    const syncWidth = () => setShellViewportWidth(shellViewport.getBoundingClientRect().width);

    syncWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);
      return () => window.removeEventListener("resize", syncWidth);
    }

    const observer = new ResizeObserver(() => syncWidth());
    observer.observe(shellViewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSidebarWidth((currentWidth) => {
      const nextWidth = clampPanelSize(currentWidth, sidebarBounds);
      return nextWidth === currentWidth ? currentWidth : nextWidth;
    });
  }, [sidebarBounds]);

  useEffect(() => {
    writePersistedPanelValue(
      APP_SIDEBAR_WIDTH_STORAGE_KEY,
      clampPanelSize(sidebarWidth, sidebarBounds),
    );
  }, [sidebarBounds, sidebarWidth]);

  useEffect(() => {
    if (requestedShellContextId === activeShellContext.id) {
      return;
    }

    setRequestedShellContextId(activeShellContext.id);
  }, [activeShellContext.id, requestedShellContextId]);

  useEffect(() => {
    writePersistedShellContextId(activeShellContext.id);
  }, [activeShellContext.id]);

  useEffect(() => {
    if (!repositoryId || !repositories.some((repository) => repository.id === repositoryId)) {
      return;
    }

    writeLastRepositoryId(repositoryId);
  }, [repositoryId, repositories]);

  useEffect(() => {
    if (location.pathname !== "/") {
      try {
        localStorage.setItem(LAST_PATH_STORAGE_KEY, location.pathname);
      } catch {
        // best-effort persistence
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!activeSidebarResize) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const shellViewport = shellViewportRef.current;
      if (!shellViewport) {
        return;
      }

      const bounds = shellViewport.getBoundingClientRect();
      setSidebarWidth(getLeftSidebarWidthFromPointer(event.clientX, bounds.left, sidebarBounds));
    };

    const handlePointerUp = () => {
      notifyShellResizeListeners(false);
      setActiveSidebarResize(false);
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
  }, [activeSidebarResize, sidebarBounds]);

  useEffect(() => {
    if (!activeSidebarResize) {
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
  }, [activeSidebarResize]);

  const handleOpenWorkspace = useCallback(
    (workspace: WorkspaceRecord) => {
      writeLastWorkspaceId(workspace.id);
      void navigate(`/repositories/${workspace.repository_id}/workspaces/${workspace.id}`);
    },
    [navigate],
  );

  const handleAddRepository = useCallback(async () => {
    let importedRepositoryId: string | null = null;

    try {
      const repository = await createRepositoryFromDirectory();
      if (!repository) {
        return;
      }

      importedRepositoryId = repository.id;
      const workspaceId = await createWorkspaceForRepository({
        checkoutType: "root",
        host: "local",
        repositoryId: repository.id,
      });

      writeLastWorkspaceId(workspaceId);
      void navigate(`/repositories/${repository.id}/workspaces/${workspaceId}`);
    } catch (error) {
      console.error("Failed to add repository:", error);
      if (importedRepositoryId) {
        void navigate(`/repositories/${importedRepositoryId}`);
        alert(`Repository was added, but the root workspace could not be created: ${error}`);
        return;
      }

      alert(`Failed to add repository: ${error}`);
    }
  }, [createRepositoryFromDirectory, createWorkspaceForRepository, navigate]);

  const handleCreateWorkspace = useCallback(
    async (nextRepositoryId: string, host: WorkspaceCreateMode) => {
      const repository = allRepositories.find(
        (item: (typeof allRepositories)[number]) => item.id === nextRepositoryId,
      );
      if (!repository) {
        return;
      }

      const existingWorkspaces = workspacesByRepositoryId[repository.id] ?? [];
      const checkoutType = existingWorkspaces.some(
        (workspace) => workspace.checkout_type === "root",
      )
        ? "worktree"
        : "root";
      try {
        const workspaceId = await createWorkspaceForRepository({
          checkoutType,
          host,
          repositoryId: repository.id,
        });

        writeLastWorkspaceId(workspaceId);
        void navigate(`/repositories/${repository.id}/workspaces/${workspaceId}`);
      } catch (error) {
        console.error("Failed to create workspace:", error);
        alert(`Failed to create workspace: ${error}`);
      }
    },
    [allRepositories, createWorkspaceForRepository, navigate, workspacesByRepositoryId],
  );

  const handleArchiveWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      try {
        if (
          (workspace.host === "local" || workspace.host === "docker") &&
          workspace.worktree_path
        ) {
          const archiveDisposition = await inspectArchive(workspace);
          if (archiveDisposition.hasUncommittedChanges) {
            const workspaceLabel = getWorkspaceDisplayName(workspace);
            const shouldProceed = window.confirm(
              `"${workspaceLabel}" has uncommitted work. Archive the workspace anyway?`,
            );
            if (!shouldProceed) {
              return;
            }
          }
        }

        await archiveWorkspace(workspace);
        safeClearWorkspaceUiState(workspace.id);

        if (readLastWorkspaceId() === workspace.id) {
          clearLastWorkspaceId();
        }

        // Clear stored sub-path if it pointed to the archived workspace
        const storedSubPath = readLastRepositorySubPath(workspace.repository_id);
        if (storedSubPath?.includes(workspace.id)) {
          clearLastRepositorySubPath(workspace.repository_id);
        }

        // Navigate away from archived workspace
        void navigate(`/repositories/${workspace.repository_id}`);
      } catch (error) {
        console.error("Failed to archive workspace:", error);
        alert(formatWorkspaceError(error, "Failed to archive workspace."));
      }
    },
    [archiveWorkspace, inspectArchive, navigate],
  );

  const handleRemoveRepository = useCallback(
    async (nextRepositoryId: string) => {
      try {
        await removeRepository(nextRepositoryId);

        if (readLastRepositoryId() === nextRepositoryId) {
          clearLastRepositoryId();
        }

        clearLastRepositorySubPath(nextRepositoryId);

        if (repositoryId === nextRepositoryId) {
          const nextRepository = repositories.find(
            (repository) => repository.id !== nextRepositoryId,
          );
          if (nextRepository) {
            void navigate(`/repositories/${nextRepository.id}`);
            return;
          }

          void navigate("/");
        }
      } catch (error) {
        console.error("Failed to remove repository:", error);
        alert(`Failed to remove repository: ${error}`);
      }
    },
    [navigate, repositoryId, repositories, removeRepository],
  );

  const handleOpenSettings = useCallback(() => {
    void navigate("/settings");
  }, [navigate]);

  const handleSidebarResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    notifyShellResizeListeners(true);
    setActiveSidebarResize(true);
  }, []);

  const handleSidebarResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSidebarWidth((currentWidth) =>
          clampPanelSize(currentWidth - SIDEBAR_RESIZE_STEP, sidebarBounds),
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSidebarWidth((currentWidth) =>
          clampPanelSize(currentWidth + SIDEBAR_RESIZE_STEP, sidebarBounds),
        );
      }

      if (event.key === "Home") {
        event.preventDefault();
        setSidebarWidth(sidebarBounds.minSize);
      }

      if (event.key === "End") {
        event.preventDefault();
        setSidebarWidth(sidebarBounds.maxSize);
      }
    },
    [sidebarBounds],
  );

  const handleSelectRepositoryIndex = useCallback(
    (index: number) => {
      const target =
        index <= repositories.length
          ? repositories[index - 1]
          : repositories[repositories.length - 1];
      if (target && target.id !== repositoryId) {
        void navigate(`/repositories/${target.id}`);
      }
    },
    [navigate, repositoryId, repositories],
  );

  // Sync the native Repository menu with the current repository list (macOS).
  useEffect(() => {
    if (isTauri()) {
      void invoke("sync_project_menu", { names: repositories.map((repository) => repository.name) });
    }
  }, [repositories]);

  useShortcutRegistration({
    enabled: shouldHandleDomAppHotkey("select-repository-index", {
      isTauriApp: isTauri(),
      macPlatform: isMacPlatform(),
    }),
    handler: useCallback(
      (match) => {
        handleSelectRepositoryIndex(match.index ?? 1);
        return true;
      },
      [handleSelectRepositoryIndex],
    ),
    id: "repository.select-index",
    priority: SHORTCUT_HANDLER_PRIORITY.app,
  });

  const outletContext = useMemo<AppShellOutletContext>(
    () => ({
      activeShellContext,
      onCreateWorkspace: handleCreateWorkspace,
      onArchiveWorkspace: handleArchiveWorkspace,
      onOpenSettings: handleOpenSettings,
      onOpenWorkspace: handleOpenWorkspace,
      onRemoveRepository: handleRemoveRepository,
      repositoryCatalog: visibleRepositoryCatalog,
      repositories,
      workspacesByRepositoryId,
    }),
    [
      activeShellContext,
      handleCreateWorkspace,
      handleArchiveWorkspace,
      handleOpenSettings,
      handleOpenWorkspace,
      handleRemoveRepository,
      visibleRepositoryCatalog,
      repositories,
      workspacesByRepositoryId,
    ],
  );

  if (repositoryCatalogQuery.isLoading && !repositoryCatalogQuery.data) {
    return (
      <div className="flex h-full w-full bg-[var(--background)]">
        <AppHotkeyListener onSelectRepositoryIndex={handleSelectRepositoryIndex} />
        <Loading />
      </div>
    );
  }

  if (allRepositories.length === 0) {
    return (
      <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)]">
        <AppHotkeyListener onSelectRepositoryIndex={handleSelectRepositoryIndex} />
        <WelcomeScreen onAddRepository={handleAddRepository} />
      </div>
    );
  }

  return (
    <WorkspaceOpenRequestsProvider>
      <DesktopRpcListener />
      <WorkspaceToolbarProvider>
        <CommandPaletteProvider
          repositories={repositories}
          workspacesByRepositoryId={workspacesByRepositoryId}
        >
          <div
            ref={shellViewportRef}
            className="flex h-full w-full flex-row bg-[var(--background)] text-[var(--foreground)]"
          >
            <AppHotkeyListener onSelectRepositoryIndex={handleSelectRepositoryIndex} />

            {/* App sidebar — directly on shell surface */}
            <AppSidebar
              activeContextName={activeShellContext.name}
              authSession={authSession}
              authSessionLoading={authSessionLoading}
              hasWorkspaceResponseReady={hasWorkspaceResponseReady}
              hasWorkspaceRunningTurn={hasWorkspaceRunningTurn}
              onAddRepository={handleAddRepository}
              onCreateWorkspace={handleCreateWorkspace}
              onArchiveWorkspace={handleArchiveWorkspace}
              onOpenSettings={handleOpenSettings}
              onRemoveRepository={handleRemoveRepository}
              repositories={repositories}
              readyRepositoryIds={readyRepositoryIds}
              workspacesByRepositoryId={workspacesByRepositoryId}
              width={sidebarWidth}
            />
            <div className="relative shrink-0">
              <div
                aria-label="Resize sidebar"
                aria-orientation="vertical"
                className="absolute inset-y-0 -left-2 z-10 w-4 cursor-col-resize"
                onKeyDown={handleSidebarResizeKeyDown}
                onPointerDown={handleSidebarResizePointerDown}
                role="separator"
                tabIndex={0}
              />
            </div>

            {/* Main card */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-[var(--project-shell-radius)] rounded-bl-[var(--project-shell-radius)] border border-[var(--border)] bg-[var(--surface)]">
              <ShellResizeProvider resizing={activeSidebarResize}>
                <div className="flex min-h-0 flex-1 flex-col">
                  <Outlet context={outletContext} />
                </div>
              </ShellResizeProvider>
            </div>
          </div>
        </CommandPaletteProvider>
      </WorkspaceToolbarProvider>
    </WorkspaceOpenRequestsProvider>
  );
}

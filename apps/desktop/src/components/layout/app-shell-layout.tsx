import { getManifestFingerprint, type WorkspaceRecord } from "@lifecycle/contracts";
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
import { useAuthSession } from "@/features/auth/state/auth-session-provider";
import { useAgentStatusIndex } from "@lifecycle/agents/react";
import { CommandPaletteProvider } from "@/features/command-palette";
import { getGitStatus } from "@/features/git/api";
import { getCurrentBranch } from "@/features/projects/api/current-branch";
import {
  addProjectFromDirectory,
  readManifest,
  removeProject,
} from "@/features/projects/api/projects";
import { useProjectCatalog } from "@/features/projects/hooks";
import {
  buildShellContexts,
  filterProjectsForShellContext,
  readPersistedShellContextId,
  resolveActiveShellContext,
  writePersistedShellContextId,
} from "@/features/projects/lib/shell-context";
import { useSettings } from "@/features/settings/state/settings-context";
import { WelcomeScreen } from "@/features/welcome/components/welcome-screen";
import {
  createWorkspace,
  archiveWorkspace,
  type WorkspaceCreateMode,
} from "@/features/workspaces/api";
import { useWorkspacesByProject } from "@/features/workspaces/hooks";
import { getWorkspaceDisplayName } from "@/features/workspaces/lib/workspace-display";
import { formatWorkspaceError } from "@/features/workspaces/lib/workspace-errors";
import {
  clearLastProjectId,
  clearLastProjectSubPath,
  readLastProjectId,
  readLastProjectSubPath,
  writeLastProjectId,
} from "@/features/projects/state/project-content-tabs";
import {
  clearLastWorkspaceId,
  clearWorkspaceCanvasState,
  readLastWorkspaceId,
  writeLastWorkspaceId,
} from "@/features/workspaces/state/workspace-canvas-state";
import { BridgeListener } from "@/features/workspaces/state/bridge-listener";
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
import { useClient, useStoreContext } from "@/store";
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
  const { collections } = useStoreContext();
  const client = useClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const shellViewportRef = useRef<HTMLDivElement | null>(null);
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProject = useWorkspacesByProject();
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
  const { worktreeRoot } = useSettings();
  const [requestedShellContextId, setRequestedShellContextId] = useState<string | null>(
    readPersistedShellContextId,
  );
  const [shellViewportWidth, setShellViewportWidth] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readPersistedPanelValue(APP_SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_APP_SIDEBAR_WIDTH),
  );
  const [activeSidebarResize, setActiveSidebarResize] = useState(false);
  const allProjects = projectCatalogQuery.data?.projects ?? [];
  const shellContexts = useMemo(
    () =>
      buildShellContexts(allProjects, {
        personalContextPersisted: authSession.state === "logged_in",
        personalDisplayName: authSession.identity?.displayName,
      }),
    [allProjects, authSession.state, authSession.identity?.displayName],
  );
  const activeShellContext = useMemo(
    () =>
      resolveActiveShellContext({
        contexts: shellContexts,
        projects: allProjects,
        requestedContextId: requestedShellContextId,
        routeProjectId: projectId,
      }),
    [allProjects, projectId, requestedShellContextId, shellContexts],
  );
  const projects = useMemo(
    () => filterProjectsForShellContext(allProjects, activeShellContext),
    [activeShellContext, allProjects],
  );
  const rawWorkspacesByProjectId: Record<string, WorkspaceRecord[]> = workspacesByProject;
  const workspacesByProjectId = useMemo((): Record<string, WorkspaceRecord[]> => {
    const visibleProjectIds = new Set(projects.map((project) => project.id));
    return Object.fromEntries(
      Object.entries(rawWorkspacesByProjectId).filter(([candidateProjectId]) =>
        visibleProjectIds.has(candidateProjectId),
      ),
    );
  }, [projects, rawWorkspacesByProjectId]);
  const visibleProjectCatalog = useMemo(() => {
    if (!projectCatalogQuery.data) {
      return undefined;
    }

    const visibleProjectIds = new Set(projects.map((project) => project.id));
    return {
      manifestsByProjectId: Object.fromEntries(
        Object.entries(projectCatalogQuery.data.manifestsByProjectId).filter(
          ([candidateProjectId]) => visibleProjectIds.has(candidateProjectId),
        ),
      ),
      projects,
    };
  }, [projectCatalogQuery.data, projects]);
  const readyProjectIds = useMemo(
    () =>
      new Set(
        projects.flatMap((project) =>
          (workspacesByProjectId[project.id] ?? []).some((workspace) =>
            hasWorkspaceResponseReady(workspace.id),
          )
            ? [project.id]
            : [],
        ),
      ),
    [hasWorkspaceResponseReady, projects, workspacesByProjectId],
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
    if (!projectId || !projects.some((project) => project.id === projectId)) {
      return;
    }

    writeLastProjectId(projectId);
  }, [projectId, projects]);

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

  const refreshWorkspaceList = useCallback(
    async (_context: string) => {
      await collections.workspaces.refresh();
    },
    [collections],
  );

  const handleOpenWorkspace = useCallback(
    (workspace: WorkspaceRecord) => {
      writeLastWorkspaceId(workspace.id);
      void navigate(`/projects/${workspace.project_id}/workspaces/${workspace.id}`);
    },
    [navigate],
  );

  const handleAddProject = useCallback(async () => {
    let importedProjectId: string | null = null;

    try {
      const project = await addProjectFromDirectory();
      if (!project) {
        return;
      }

      importedProjectId = project.id;
      void collections.projects.refresh();
      const manifestStatus = await readManifest(client, project.path);
      const manifestJson =
        manifestStatus.state === "valid" ? JSON.stringify(manifestStatus.result.config) : undefined;
      const manifestFingerprint =
        manifestStatus.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;
      const branch = await getCurrentBranch(client, project.path);
      const workspaceId = await createWorkspace(client, {
        baseRef: branch,
        checkoutType: "root",
        manifestFingerprint,
        manifestJson,
        projectId: project.id,
        projectPath: project.path,
      });

      await refreshWorkspaceList("creating root workspace");
      writeLastWorkspaceId(workspaceId);
      void navigate(`/projects/${project.id}/workspaces/${workspaceId}`);
    } catch (error) {
      console.error("Failed to add project:", error);
      if (importedProjectId) {
        void navigate(`/projects/${importedProjectId}`);
        alert(`Project was added, but the root workspace could not be created: ${error}`);
        return;
      }

      alert(`Failed to add project: ${error}`);
    }
  }, [collections, navigate, refreshWorkspaceList, client]);

  const handleCreateWorkspace = useCallback(
    async (nextProjectId: string, target: WorkspaceCreateMode) => {
      const project = allProjects.find((item) => item.id === nextProjectId);
      if (!project) {
        return;
      }

      const existingWorkspaces = workspacesByProjectId[project.id] ?? [];
      const checkoutType = existingWorkspaces.some(
        (workspace) => workspace.checkout_type === "root",
      )
        ? "worktree"
        : "root";
      const manifestStatus = projectCatalogQuery.data?.manifestsByProjectId[project.id];
      const manifestJson =
        manifestStatus?.state === "valid"
          ? JSON.stringify(manifestStatus.result.config)
          : undefined;
      const manifestFingerprint =
        manifestStatus?.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;

      try {
        const branch = await getCurrentBranch(client, project.path);
        const workspaceId = await createWorkspace(client, {
          baseRef: branch,
          checkoutType,
          manifestFingerprint,
          manifestJson,
          projectId: project.id,
          projectPath: project.path,
          target,
          worktreeRoot,
        });

        await refreshWorkspaceList("creating workspace");
        writeLastWorkspaceId(workspaceId);
        void navigate(`/projects/${project.id}/workspaces/${workspaceId}`);
      } catch (error) {
        console.error("Failed to create workspace:", error);
        alert(`Failed to create workspace: ${error}`);
      }
    },
    [
      allProjects,
      navigate,
      projectCatalogQuery.data,
      refreshWorkspaceList,
      client,
      workspacesByProjectId,
      worktreeRoot,
    ],
  );

  const handleArchiveWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      try {
        if (
          (workspace.host === "local" || workspace.host === "docker") &&
          workspace.worktree_path
        ) {
          const gitStatus = await getGitStatus(client, workspace.id);
          if (gitStatus.files.length > 0) {
            const workspaceLabel = getWorkspaceDisplayName(workspace);
            const shouldProceed = window.confirm(
              `"${workspaceLabel}" has uncommitted work. Archive the workspace anyway?`,
            );
            if (!shouldProceed) {
              return;
            }
          }
        }

        await archiveWorkspace(client, workspace.id);
        void collections.workspaces.refresh();
        void collections.services.refresh();
        safeClearWorkspaceUiState(workspace.id);

        if (readLastWorkspaceId() === workspace.id) {
          clearLastWorkspaceId();
        }

        // Clear stored sub-path if it pointed to the archived workspace
        const storedSubPath = readLastProjectSubPath(workspace.project_id);
        if (storedSubPath?.includes(workspace.id)) {
          clearLastProjectSubPath(workspace.project_id);
        }

        // Navigate away from archived workspace
        void navigate(`/projects/${workspace.project_id}`);
      } catch (error) {
        console.error("Failed to archive workspace:", error);
        alert(formatWorkspaceError(error, "Failed to archive workspace."));
      }
    },
    [collections, navigate, client],
  );

  const handleRemoveProject = useCallback(
    async (nextProjectId: string) => {
      try {
        await removeProject(client, nextProjectId);
        void collections.projects.refresh();

        if (readLastProjectId() === nextProjectId) {
          clearLastProjectId();
        }

        clearLastProjectSubPath(nextProjectId);

        if (projectId === nextProjectId) {
          const nextProject = projects.find((project) => project.id !== nextProjectId);
          if (nextProject) {
            void navigate(`/projects/${nextProject.id}`);
            return;
          }

          void navigate("/");
        }
      } catch (error) {
        console.error("Failed to remove project:", error);
        alert(`Failed to remove project: ${error}`);
      }
    },
    [collections, navigate, projectId, projects, client],
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

  const handleSelectProjectIndex = useCallback(
    (index: number) => {
      const target = index <= projects.length ? projects[index - 1] : projects[projects.length - 1];
      if (target && target.id !== projectId) {
        void navigate(`/projects/${target.id}`);
      }
    },
    [navigate, projectId, projects],
  );

  // Sync the native Project menu with the current project list (macOS).
  useEffect(() => {
    if (isTauri()) {
      void invoke("sync_project_menu", { names: projects.map((p) => p.name) });
    }
  }, [projects]);

  useShortcutRegistration({
    enabled: shouldHandleDomAppHotkey("select-project-index", {
      isTauriApp: isTauri(),
      macPlatform: isMacPlatform(),
    }),
    handler: useCallback(
      (match) => {
        handleSelectProjectIndex(match.index ?? 1);
        return true;
      },
      [handleSelectProjectIndex],
    ),
    id: "project.select-index",
    priority: SHORTCUT_HANDLER_PRIORITY.app,
  });

  const outletContext = useMemo<AppShellOutletContext>(
    () => ({
      activeShellContext,
      onCreateWorkspace: handleCreateWorkspace,
      onArchiveWorkspace: handleArchiveWorkspace,
      onOpenSettings: handleOpenSettings,
      onOpenWorkspace: handleOpenWorkspace,
      onRemoveProject: handleRemoveProject,
      projectCatalog: visibleProjectCatalog,
      projects,
      workspacesByProjectId,
    }),
    [
      activeShellContext,
      handleCreateWorkspace,
      handleArchiveWorkspace,
      handleOpenSettings,
      handleOpenWorkspace,
      handleRemoveProject,
      visibleProjectCatalog,
      projects,
      workspacesByProjectId,
    ],
  );

  if (projectCatalogQuery.isLoading && !projectCatalogQuery.data) {
    return (
      <div className="flex h-full w-full bg-[var(--background)]">
        <AppHotkeyListener onSelectProjectIndex={handleSelectProjectIndex} />
        <Loading />
      </div>
    );
  }

  if (allProjects.length === 0) {
    return (
      <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)]">
        <AppHotkeyListener onSelectProjectIndex={handleSelectProjectIndex} />
        <WelcomeScreen onAddProject={handleAddProject} />
      </div>
    );
  }

  return (
    <WorkspaceOpenRequestsProvider>
      <BridgeListener />
      <WorkspaceToolbarProvider>
        <CommandPaletteProvider projects={projects} workspacesByProjectId={workspacesByProjectId}>
          <div
            ref={shellViewportRef}
            className="flex h-full w-full flex-row bg-[var(--background)] text-[var(--foreground)]"
          >
            <AppHotkeyListener onSelectProjectIndex={handleSelectProjectIndex} />

            {/* App sidebar */}
            <AppSidebar
              activeContextName={activeShellContext.name}
              authSession={authSession}
              authSessionLoading={authSessionLoading}
              hasWorkspaceResponseReady={hasWorkspaceResponseReady}
              hasWorkspaceRunningTurn={hasWorkspaceRunningTurn}
              onAddProject={handleAddProject}
              onCreateWorkspace={handleCreateWorkspace}
              onArchiveWorkspace={handleArchiveWorkspace}
              onOpenSettings={handleOpenSettings}
              onRemoveProject={handleRemoveProject}
              projects={projects}
              readyProjectIds={readyProjectIds}
              workspacesByProjectId={workspacesByProjectId}
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

            {/* Main area */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--background)]">
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

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
import { CommandPaletteProvider } from "@/features/command-palette";
import { getGitStatus } from "@/features/git/api";
import { getCurrentBranch } from "@/features/projects/api/current-branch";
import {
  addProjectFromDirectory,
  readManifest,
  removeProject,
} from "@/features/projects/api/projects";
import { projectKeys, useProjectCatalog } from "@/features/projects/hooks";
import {
  buildShellContexts,
  filterProjectsForShellContext,
  readPersistedShellContextId,
  resolveActiveShellContext,
  writePersistedShellContextId,
} from "@/features/projects/lib/shell-context";
import { useSettings } from "@/features/settings/state/settings-provider";
import { useTerminalResponseReady } from "@/features/terminals/state/terminal-response-ready-provider";
import { WelcomeScreen } from "@/features/welcome/components/welcome-screen";
import {
  createWorkspace,
  destroyWorkspace,
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
import { createWorkspacesByProjectQuery } from "@/features/workspaces/queries";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { WorkspaceToolbarProvider } from "@/features/workspaces/state/workspace-toolbar-context";
import {
  APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
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
import { useQueryClient } from "@/query";
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

function readPersistedSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writePersistedSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // best-effort persistence
  }
}

function safeClearWorkspaceUiState(workspaceId: string): void {
  try {
    clearWorkspaceCanvasState(workspaceId);
  } catch {
    // best-effort cleanup
  }
}

export const LAST_PATH_STORAGE_KEY = "lifecycle.desktop.last-path";

export function AppShellLayout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const shellViewportRef = useRef<HTMLDivElement | null>(null);
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const { isLoading: authSessionLoading, session: authSession } = useAuthSession();
  const { hasWorkspaceResponseReady } = useTerminalResponseReady();
  const { worktreeRoot } = useSettings();
  const [requestedShellContextId, setRequestedShellContextId] = useState<string | null>(
    readPersistedShellContextId,
  );
  const [shellViewportWidth, setShellViewportWidth] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readPersistedPanelValue(APP_SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_APP_SIDEBAR_WIDTH),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readPersistedSidebarCollapsed);
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
  const rawWorkspacesByProjectId = workspacesByProjectQuery.data ?? {};
  const workspacesByProjectId = useMemo(() => {
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
    writePersistedSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

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
    async (context: string) => {
      try {
        await client.refetch(createWorkspacesByProjectQuery());
      } catch (error) {
        console.warn(`Failed to refresh workspace list after ${context}:`, error);
        client.invalidate(workspaceKeys.byProject());
      }
    },
    [client],
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
      client.invalidate(projectKeys.catalog());
      const manifestStatus = await readManifest(project.path);
      const manifestJson =
        manifestStatus.state === "valid" ? JSON.stringify(manifestStatus.result.config) : undefined;
      const manifestFingerprint =
        manifestStatus.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;
      const branch = await getCurrentBranch(project.path);
      const workspaceId = await createWorkspace({
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
  }, [client, navigate, refreshWorkspaceList]);

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
        const branch = await getCurrentBranch(project.path);
        const workspaceId = await createWorkspace({
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
      workspacesByProjectId,
      worktreeRoot,
    ],
  );

  const handleForkWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      const project = allProjects.find((item) => item.id === workspace.project_id);
      if (!project) {
        return;
      }

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
        const baseRef =
          workspace.checkout_type === "root"
            ? await getCurrentBranch(project.path)
            : workspace.source_ref;
        const newWorkspaceId = await createWorkspace({
          baseRef,
          checkoutType: "worktree",
          manifestFingerprint,
          manifestJson,
          projectId: project.id,
          projectPath: project.path,
          worktreeRoot,
        });

        await refreshWorkspaceList("forking workspace");
        writeLastWorkspaceId(newWorkspaceId);
        void navigate(`/projects/${project.id}/workspaces/${newWorkspaceId}`);
      } catch (error) {
        console.error("Failed to fork workspace:", error);
        alert(`Failed to fork workspace: ${error}`);
      }
    },
    [navigate, projectCatalogQuery.data, allProjects, refreshWorkspaceList, worktreeRoot],
  );

  const handleDestroyWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      try {
        if (
          (workspace.target === "local" || workspace.target === "docker") &&
          workspace.worktree_path
        ) {
          const gitStatus = await getGitStatus(workspace.id);
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

        await destroyWorkspace(workspace.id);
        client.invalidate(workspaceKeys.byProject());
        client.invalidateMatching((key) => key.includes(workspace.id));
        safeClearWorkspaceUiState(workspace.id);

        if (readLastWorkspaceId() === workspace.id) {
          clearLastWorkspaceId();
        }

        // Clear stored sub-path if it pointed to the destroyed workspace
        const storedSubPath = readLastProjectSubPath(workspace.project_id);
        if (storedSubPath?.includes(workspace.id)) {
          clearLastProjectSubPath(workspace.project_id);
        }

        // Navigate away from destroyed workspace
        void navigate(`/projects/${workspace.project_id}`);
      } catch (error) {
        console.error("Failed to archive workspace:", error);
        alert(formatWorkspaceError(error, "Failed to archive workspace."));
      }
    },
    [client, navigate],
  );

  const handleRemoveProject = useCallback(
    async (nextProjectId: string) => {
      try {
        await removeProject(nextProjectId);
        client.invalidate(projectKeys.catalog());

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
    [client, navigate, projectId, projects],
  );

  const handleOpenSettings = useCallback(() => {
    void navigate("/settings");
  }, [navigate]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => !current);
  }, []);

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
      onDestroyWorkspace: handleDestroyWorkspace,
      onForkWorkspace: handleForkWorkspace,
      onOpenSettings: handleOpenSettings,
      onOpenWorkspace: handleOpenWorkspace,
      onRemoveProject: handleRemoveProject,
      onToggleSidebar: handleToggleSidebar,
      projectCatalog: visibleProjectCatalog,
      projects,
      sidebarCollapsed,
      workspacesByProjectId,
    }),
    [
      activeShellContext,
      handleCreateWorkspace,
      handleDestroyWorkspace,
      handleForkWorkspace,
      handleOpenSettings,
      handleOpenWorkspace,
      handleRemoveProject,
      handleToggleSidebar,
      visibleProjectCatalog,
      projects,
      sidebarCollapsed,
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
              collapsed={sidebarCollapsed}
              onAddProject={handleAddProject}
              onOpenSettings={handleOpenSettings}
              onRemoveProject={handleRemoveProject}
              onToggleCollapse={handleToggleSidebar}
              projects={projects}
              readyProjectIds={readyProjectIds}
              workspacesByProjectId={workspacesByProjectId}
              width={sidebarWidth}
            />
            {!sidebarCollapsed ? (
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
            ) : null}

            {/* Main area */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface)]">
              <ShellResizeProvider resizing={activeSidebarResize}>
                <div className="min-h-0 flex-1">
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

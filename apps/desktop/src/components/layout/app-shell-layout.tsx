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
import { Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHotkeyListener } from "../../app/app-hotkey-listener";
import { useAuthSession } from "../../features/auth/state/auth-session-provider";
import { CommandPaletteProvider } from "../../features/command-palette";
import { getGitStatus } from "../../features/git/api";
import { getCurrentBranch } from "../../features/projects/api/current-branch";
import {
  addProjectFromDirectory,
  readManifest,
  removeProject,
} from "../../features/projects/api/projects";
import { projectKeys, useProjectCatalog } from "../../features/projects/hooks";
import { ProjectSwitcherStrip } from "../../features/projects/components/project-switcher-strip";
import { useSettings } from "../../features/settings/state/app-settings-provider";
import { WelcomeScreen } from "../../features/welcome/components/welcome-screen";
import { createWorkspace, destroyWorkspace } from "../../features/workspaces/api";
import {
  createWorkspacesByProjectQuery,
  useWorkspacesByProject,
  workspaceKeys,
} from "../../features/workspaces/hooks";
import { getWorkspaceDisplayName } from "../../features/workspaces/lib/workspace-display";
import { formatWorkspaceError } from "../../features/workspaces/lib/workspace-errors";
import { readProjectRouteFocus } from "../../features/projects/lib/project-route-state";
import {
  clearLastWorkspaceId,
  clearWorkspaceCanvasState,
  readLastWorkspaceId,
  writeLastWorkspaceId,
} from "../../features/workspaces/state/workspace-canvas-state";
import { WorkspaceOpenRequestsProvider } from "../../features/workspaces/state/workspace-open-requests";
import {
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
  PROJECT_SHELL_SIDEBAR_COLLAPSED_STORAGE_KEY,
  PROJECT_SHELL_SIDEBAR_WIDTH_STORAGE_KEY,
  clampPanelSize,
  getLeftSidebarWidthFromPointer,
  getSidebarWidthBounds,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "../../lib/panel-layout";
import { useQueryClient } from "../../query";
import { type AppShellOutletContext } from "./app-shell-context";
import { notifyShellResizeListeners, ShellResizeProvider } from "./shell-resize-provider";

const SIDEBAR_RESIZE_STEP = 16;

function readPersistedSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(PROJECT_SHELL_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writePersistedSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(PROJECT_SHELL_SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // best-effort persistence
  }
}

function workspaceFocusSearch(workspaceId: string): string {
  return `?workspace=${workspaceId}`;
}

function safeClearWorkspaceUiState(workspaceId: string): void {
  try {
    clearWorkspaceCanvasState(workspaceId);
  } catch {
    // best-effort cleanup
  }
}

export function AppShellLayout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const shellViewportRef = useRef<HTMLDivElement | null>(null);
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const { isLoading: authSessionLoading, session: authSession } = useAuthSession();
  const { worktreeRoot } = useSettings();
  const [shellViewportWidth, setShellViewportWidth] = useState(0);
  const [projectNavigationWidth, setProjectNavigationWidth] = useState(() =>
    readPersistedPanelValue(PROJECT_SHELL_SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_LEFT_SIDEBAR_WIDTH),
  );
  const [projectNavigationCollapsed, setProjectNavigationCollapsed] = useState(
    readPersistedSidebarCollapsed,
  );
  const [activeProjectNavigationResize, setActiveProjectNavigationResize] = useState(false);
  const projects = projectCatalogQuery.data?.projects ?? [];
  const rawWorkspacesByProjectId = workspacesByProjectQuery.data ?? {};
  const workspacesByProjectId = useMemo(() => {
    const visibleProjectIds = new Set(projects.map((project) => project.id));
    return Object.fromEntries(
      Object.entries(rawWorkspacesByProjectId).filter(([candidateProjectId]) =>
        visibleProjectIds.has(candidateProjectId),
      ),
    );
  }, [projects, rawWorkspacesByProjectId]);
  const activeProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? projects[0] ?? null,
    [projectId, projects],
  );
  const routeFocus = useMemo(() => readProjectRouteFocus(searchParams), [searchParams]);
  const selectedWorkspaceId = routeFocus?.kind === "workspace" ? routeFocus.workspaceId : null;
  const selectedWorkspace = useMemo(
    () =>
      selectedWorkspaceId
        ? (Object.values(workspacesByProjectId)
            .flat()
            .find((workspace) => workspace.id === selectedWorkspaceId) ?? null)
        : null,
    [selectedWorkspaceId, workspacesByProjectId],
  );
  const projectShellWidth = shellViewportWidth;
  const projectNavigationBounds = useMemo(
    () =>
      getSidebarWidthBounds({
        containerWidth: projectShellWidth,
        maxWidth: MAX_LEFT_SIDEBAR_WIDTH,
        minWidth: MIN_LEFT_SIDEBAR_WIDTH,
        oppositeSidebarWidth: 0,
      }),
    [projectShellWidth],
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
    setProjectNavigationWidth((currentWidth) => {
      const nextWidth = clampPanelSize(currentWidth, projectNavigationBounds);
      return nextWidth === currentWidth ? currentWidth : nextWidth;
    });
  }, [projectNavigationBounds]);

  useEffect(() => {
    writePersistedPanelValue(
      PROJECT_SHELL_SIDEBAR_WIDTH_STORAGE_KEY,
      clampPanelSize(projectNavigationWidth, projectNavigationBounds),
    );
  }, [projectNavigationBounds, projectNavigationWidth]);

  useEffect(() => {
    writePersistedSidebarCollapsed(projectNavigationCollapsed);
  }, [projectNavigationCollapsed]);

  useEffect(() => {
    if (!activeProjectNavigationResize) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const shellViewport = shellViewportRef.current;
      if (!shellViewport) {
        return;
      }

      const bounds = shellViewport.getBoundingClientRect();
      setProjectNavigationWidth(
        getLeftSidebarWidthFromPointer(event.clientX, bounds.left, projectNavigationBounds),
      );
    };

    const handlePointerUp = () => {
      notifyShellResizeListeners(false);
      setActiveProjectNavigationResize(false);
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
  }, [activeProjectNavigationResize, projectNavigationBounds]);

  useEffect(() => {
    if (!activeProjectNavigationResize) {
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
  }, [activeProjectNavigationResize]);

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
      void navigate(`/projects/${workspace.project_id}${workspaceFocusSearch(workspace.id)}`);
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
        kind: "root",
        manifestFingerprint,
        manifestJson,
        projectId: project.id,
        projectPath: project.path,
      });

      await refreshWorkspaceList("creating root workspace");
      writeLastWorkspaceId(workspaceId);
      void navigate(`/projects/${project.id}${workspaceFocusSearch(workspaceId)}`);
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
    async (nextProjectId: string) => {
      const project = projects.find((item) => item.id === nextProjectId);
      if (!project) {
        return;
      }

      const existingWorkspaces = workspacesByProjectId[project.id] ?? [];
      const kind = existingWorkspaces.some((workspace) => workspace.kind === "root")
        ? "managed"
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
          kind,
          manifestFingerprint,
          manifestJson,
          projectId: project.id,
          projectPath: project.path,
          worktreeRoot,
        });

        await refreshWorkspaceList("creating workspace");
        writeLastWorkspaceId(workspaceId);
        void navigate(`/projects/${project.id}${workspaceFocusSearch(workspaceId)}`);
      } catch (error) {
        console.error("Failed to create workspace:", error);
        alert(`Failed to create workspace: ${error}`);
      }
    },
    [
      navigate,
      projectCatalogQuery.data,
      projects,
      refreshWorkspaceList,
      workspacesByProjectId,
      worktreeRoot,
    ],
  );

  const handleForkWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      const project = projects.find((item) => item.id === workspace.project_id);
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
          workspace.kind === "root" ? await getCurrentBranch(project.path) : workspace.source_ref;
        const newWorkspaceId = await createWorkspace({
          baseRef,
          kind: "managed",
          manifestFingerprint,
          manifestJson,
          projectId: project.id,
          projectPath: project.path,
          worktreeRoot,
        });

        await refreshWorkspaceList("forking workspace");
        writeLastWorkspaceId(newWorkspaceId);
        void navigate(`/projects/${project.id}${workspaceFocusSearch(newWorkspaceId)}`);
      } catch (error) {
        console.error("Failed to fork workspace:", error);
        alert(`Failed to fork workspace: ${error}`);
      }
    },
    [navigate, projectCatalogQuery.data, projects, refreshWorkspaceList, worktreeRoot],
  );

  const handleDestroyWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      try {
        if (workspace.mode === "local" && workspace.worktree_path) {
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

        if (selectedWorkspaceId === workspace.id) {
          void navigate(`/projects/${workspace.project_id}`);
        }
      } catch (error) {
        console.error("Failed to archive workspace:", error);
        alert(formatWorkspaceError(error, "Failed to archive workspace."));
      }
    },
    [client, navigate, selectedWorkspaceId],
  );

  const handleRemoveProject = useCallback(
    async (nextProjectId: string) => {
      try {
        await removeProject(nextProjectId);
        client.invalidate(projectKeys.catalog());

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

  const handleProjectNavigationResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      notifyShellResizeListeners(true);
      setActiveProjectNavigationResize(true);
    },
    [],
  );

  const handleProjectNavigationResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setProjectNavigationWidth((currentWidth) =>
          clampPanelSize(currentWidth - SIDEBAR_RESIZE_STEP, projectNavigationBounds),
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setProjectNavigationWidth((currentWidth) =>
          clampPanelSize(currentWidth + SIDEBAR_RESIZE_STEP, projectNavigationBounds),
        );
      }

      if (event.key === "Home") {
        event.preventDefault();
        setProjectNavigationWidth(projectNavigationBounds.minSize);
      }

      if (event.key === "End") {
        event.preventDefault();
        setProjectNavigationWidth(projectNavigationBounds.maxSize);
      }
    },
    [projectNavigationBounds],
  );

  const commandPaletteForkHandler = selectedWorkspace
    ? () => void handleForkWorkspace(selectedWorkspace)
    : undefined;

  const outletContext = useMemo<AppShellOutletContext>(
    () => ({
      onCreateWorkspace: handleCreateWorkspace,
      onDestroyWorkspace: handleDestroyWorkspace,
      onForkWorkspace: handleForkWorkspace,
      onOpenWorkspace: handleOpenWorkspace,
      onToggleProjectNavigation: () => setProjectNavigationCollapsed((current) => !current),
      onProjectNavigationResizeKeyDown: handleProjectNavigationResizeKeyDown,
      onProjectNavigationResizePointerDown: handleProjectNavigationResizePointerDown,
      onRemoveProject: handleRemoveProject,
      projectNavigationCollapsed,
      projectNavigationWidth,
      projectCatalog: projectCatalogQuery.data,
      projects,
      workspacesByProjectId,
    }),
    [
      handleCreateWorkspace,
      handleDestroyWorkspace,
      handleForkWorkspace,
      handleOpenWorkspace,
      handleProjectNavigationResizeKeyDown,
      handleProjectNavigationResizePointerDown,
      handleRemoveProject,
      projectNavigationCollapsed,
      projectCatalogQuery.data,
      projectNavigationWidth,
      projects,
      workspacesByProjectId,
    ],
  );

  if (projectCatalogQuery.isLoading && !projectCatalogQuery.data) {
    return (
      <div className="flex h-full w-full bg-[var(--background)]">
        <AppHotkeyListener />
        <Loading />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)]">
        <AppHotkeyListener />
        <WelcomeScreen onAddProject={handleAddProject} />
      </div>
    );
  }

  return (
    <WorkspaceOpenRequestsProvider>
      <CommandPaletteProvider onForkWorkspace={commandPaletteForkHandler}>
        <div className="flex h-full w-full flex-col gap-0.5 bg-[var(--panel)] px-2 pb-2 pt-0.5 text-[var(--foreground)]">
          <AppHotkeyListener />
          <ProjectSwitcherStrip
            activeProjectId={activeProject?.id ?? null}
            authSession={authSession}
            authSessionLoading={authSessionLoading}
            onAddProject={handleAddProject}
            onOpenSettings={handleOpenSettings}
            projects={projects}
          />
          <div ref={shellViewportRef} className="min-h-0 flex flex-1">
            <ShellResizeProvider resizing={activeProjectNavigationResize}>
              <div className="min-w-0 flex-1">
                <Outlet context={outletContext} />
              </div>
            </ShellResizeProvider>
          </div>
        </div>
      </CommandPaletteProvider>
    </WorkspaceOpenRequestsProvider>
  );
}

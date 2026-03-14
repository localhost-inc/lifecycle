import {
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { getManifestFingerprint } from "@lifecycle/contracts";
import { Loading, SidebarInset } from "@lifecycle/ui";
import { Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHotkeyListener } from "../../app/app-hotkey-listener";
import { CommandPaletteProvider } from "../../features/command-palette";
import { getCurrentBranch } from "../../features/projects/api/current-branch";
import { addProjectFromDirectory, readManifest, removeProject } from "../../features/projects/api/projects";
import { getGitStatus } from "../../features/git/api";
import { WelcomeScreen } from "../../features/welcome/components/welcome-screen";
import { projectKeys, useProjectCatalog } from "../../features/projects/hooks";
import { useSettings } from "../../features/settings/state/app-settings-provider";
import { createWorkspace, destroyWorkspace } from "../../features/workspaces/api";
import {
  createWorkspacesByProjectQuery,
  useWorkspacesByProject,
  workspaceKeys,
} from "../../features/workspaces/hooks";
import { getWorkspaceDisplayName } from "../../features/workspaces/lib/workspace-display";
import {
  clearLastWorkspaceId,
  readLastWorkspaceId,
  writeLastWorkspaceId,
} from "../../features/workspaces/state/workspace-surface-state";
import { WorkspaceOpenRequestsProvider } from "../../features/workspaces/state/workspace-open-requests";
import {
  clampPanelSize,
  DASHBOARD_LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  DASHBOARD_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
  DASHBOARD_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  DASHBOARD_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  getLeftSidebarWidthFromPointer,
  getRightSidebarWidthFromPointer,
  getSidebarWidthBounds,
  MAX_LEFT_SIDEBAR_WIDTH,
  MAX_RIGHT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
  MIN_RIGHT_SIDEBAR_WIDTH,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "../../lib/panel-layout";
import { useQueryClient } from "../../query";
import { notifyShellResizeListeners, ShellResizeProvider } from "./shell-resize-provider";
import { Sidebar } from "./sidebar";
import { AppStatusBar } from "./app-status-bar";
import { TitleBar } from "./title-bar";

const SIDEBAR_RESIZE_STEP = 16;
const LEFT_SIDEBAR_RAIL_CLASS_NAME =
  "flex min-h-0 shrink-0 overflow-hidden bg-[var(--sidebar-background)]";
const LEFT_SIDEBAR_RAIL_TRANSITION_CLASS_NAME = "transition-[width] duration-200 ease-linear";

export function getLeftSidebarRailClassName(resizing: boolean): string {
  return resizing
    ? LEFT_SIDEBAR_RAIL_CLASS_NAME
    : `${LEFT_SIDEBAR_RAIL_CLASS_NAME} ${LEFT_SIDEBAR_RAIL_TRANSITION_CLASS_NAME}`;
}

export function getLeftSidebarRailWidth({
  collapsed,
  width,
}: {
  collapsed: boolean;
  width: number;
}): string {
  return collapsed ? "0px" : `${width}px`;
}

export function DashboardLayout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const [searchParams] = useSearchParams();
  const attemptedWorkspaceRestoreRef = useRef(false);
  const layoutRowRef = useRef<HTMLDivElement | null>(null);
  const { worktreeRoot } = useSettings();
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const [layoutRowWidth, setLayoutRowWidth] = useState(0);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() =>
    readPersistedPanelValue(DASHBOARD_LEFT_SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_LEFT_SIDEBAR_WIDTH),
  );
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() =>
    readPersistedPanelValue(DASHBOARD_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_RIGHT_SIDEBAR_WIDTH),
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DASHBOARD_LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DASHBOARD_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [activeSidebarResize, setActiveSidebarResize] = useState<"left" | "right" | null>(null);
  const projects = projectCatalogQuery.data?.projects ?? [];
  const rawWorkspacesByProjectId = workspacesByProjectQuery.data ?? {};
  const workspacesByProjectId = useMemo(() => {
    const visibleProjectIds = new Set(projects.map((project) => project.id));

    return Object.fromEntries(
      Object.entries(rawWorkspacesByProjectId).filter(([projectId]) =>
        visibleProjectIds.has(projectId),
      ),
    );
  }, [projects, rawWorkspacesByProjectId]);
  const workspaces = useMemo(
    () => Object.values(workspacesByProjectId).flat(),
    [workspacesByProjectId],
  );
  const selectedWorkspaceId = workspaceId ?? null;
  const selectedWorkspace = useMemo(
    () =>
      selectedWorkspaceId
        ? (workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null)
        : null,
    [selectedWorkspaceId, workspaces],
  );
  const sourceWorkspace = useMemo(
    () =>
      selectedWorkspace?.source_workspace_id
        ? (workspaces.find((workspace) => workspace.id === selectedWorkspace.source_workspace_id) ??
          null)
        : null,
    [selectedWorkspace, workspaces],
  );
  const selectedProjectFromQuery = searchParams.get("project");
  const fallbackSelectedProjectId =
    selectedProjectFromQuery && projects.some((project) => project.id === selectedProjectFromQuery)
      ? selectedProjectFromQuery
      : null;
  const activeProjectId = selectedWorkspaceId ? null : fallbackSelectedProjectId;
  const showRightSidebar = selectedWorkspaceId !== null;
  const leftSidebarBounds = useMemo(
    () =>
      getSidebarWidthBounds({
        containerWidth: layoutRowWidth,
        maxWidth: MAX_LEFT_SIDEBAR_WIDTH,
        minWidth: MIN_LEFT_SIDEBAR_WIDTH,
        oppositeSidebarWidth: showRightSidebar ? rightSidebarWidth : 0,
      }),
    [layoutRowWidth, rightSidebarWidth, showRightSidebar],
  );
  const rightSidebarBounds = useMemo(
    () =>
      getSidebarWidthBounds({
        containerWidth: layoutRowWidth,
        maxWidth: MAX_RIGHT_SIDEBAR_WIDTH,
        minWidth: MIN_RIGHT_SIDEBAR_WIDTH,
        oppositeSidebarWidth: leftSidebarCollapsed ? 0 : leftSidebarWidth,
      }),
    [layoutRowWidth, leftSidebarWidth],
  );
  const leftSidebarBoundsRef = useRef(leftSidebarBounds);
  const rightSidebarBoundsRef = useRef(rightSidebarBounds);
  const leftSidebarCollapsedRef = useRef(leftSidebarCollapsed);
  leftSidebarBoundsRef.current = leftSidebarBounds;
  rightSidebarBoundsRef.current = rightSidebarBounds;
  leftSidebarCollapsedRef.current = leftSidebarCollapsed;

  useEffect(() => {
    const layoutRow = layoutRowRef.current;
    if (!layoutRow) {
      return;
    }

    const syncWidth = () => {
      setLayoutRowWidth(layoutRow.getBoundingClientRect().width);
    };

    syncWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);
      return () => window.removeEventListener("resize", syncWidth);
    }

    const observer = new ResizeObserver(() => syncWidth());
    observer.observe(layoutRow);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedWorkspaceId) {
      writeLastWorkspaceId(selectedWorkspaceId);
      attemptedWorkspaceRestoreRef.current = true;
      return;
    }

    if (attemptedWorkspaceRestoreRef.current) {
      return;
    }

    if (workspacesByProjectQuery.isLoading || workspacesByProjectQuery.error) {
      return;
    }

    attemptedWorkspaceRestoreRef.current = true;
    if (fallbackSelectedProjectId) {
      return;
    }

    const lastWorkspaceId = readLastWorkspaceId();
    if (!lastWorkspaceId) {
      return;
    }

    if (!workspaces.some((workspace) => workspace.id === lastWorkspaceId)) {
      clearLastWorkspaceId();
      return;
    }

    void navigate(`/workspaces/${lastWorkspaceId}`, { replace: true });
  }, [
    fallbackSelectedProjectId,
    navigate,
    selectedWorkspaceId,
    workspaces,
    workspacesByProjectQuery.error,
    workspacesByProjectQuery.isLoading,
  ]);

  useEffect(() => {
    setLeftSidebarWidth((current) => {
      const nextWidth = clampPanelSize(current, leftSidebarBounds);
      return nextWidth === current ? current : nextWidth;
    });
  }, [leftSidebarBounds]);

  useEffect(() => {
    setRightSidebarWidth((current) => {
      const nextWidth = clampPanelSize(current, rightSidebarBounds);
      return nextWidth === current ? current : nextWidth;
    });
  }, [rightSidebarBounds]);

  useEffect(() => {
    writePersistedPanelValue(
      DASHBOARD_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
      clampPanelSize(leftSidebarWidth, leftSidebarBounds),
    );
  }, [leftSidebarBounds, leftSidebarWidth]);

  useEffect(() => {
    writePersistedPanelValue(
      DASHBOARD_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
      clampPanelSize(rightSidebarWidth, rightSidebarBounds),
    );
  }, [rightSidebarBounds, rightSidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DASHBOARD_LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(leftSidebarCollapsed),
      );
    } catch {
      // best-effort
    }
  }, [leftSidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DASHBOARD_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(rightSidebarCollapsed),
      );
    } catch {
      // best-effort
    }
  }, [rightSidebarCollapsed]);

  useEffect(() => {
    if (activeSidebarResize === null) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const layoutRow = layoutRowRef.current;
      if (!layoutRow) {
        return;
      }

      const bounds = layoutRow.getBoundingClientRect();
      if (activeSidebarResize === "left") {
        if (leftSidebarCollapsedRef.current) {
          leftSidebarCollapsedRef.current = false;
          setLeftSidebarCollapsed(false);
        }
        setLeftSidebarWidth(
          getLeftSidebarWidthFromPointer(event.clientX, bounds.left, leftSidebarBoundsRef.current),
        );
        return;
      }

      setRightSidebarWidth(
        getRightSidebarWidthFromPointer(event.clientX, bounds.right, rightSidebarBoundsRef.current),
      );
    };

    const handlePointerUp = () => {
      notifyShellResizeListeners(false);
      setActiveSidebarResize(null);
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
  }, [activeSidebarResize]);

  useEffect(() => {
    return () => {
      notifyShellResizeListeners(false);
    };
  }, []);

  useEffect(() => {
    if (activeSidebarResize === null) {
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

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      void navigate(`/workspaces/${workspaceId}`);
    },
    [navigate],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const workspaces = workspacesByProjectId[projectId] ?? [];
      const firstWorkspace = workspaces[0];
      if (firstWorkspace) {
        void navigate(`/workspaces/${firstWorkspace.id}`);
        return;
      }

      void navigate(`/?project=${projectId}`);
    },
    [navigate, workspacesByProjectId],
  );

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

  const handleAddProject = useCallback(async () => {
    let importedProjectId: string | null = null;
    try {
      const project = await addProjectFromDirectory();
      if (!project) return;
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
        kind: "root",
        projectId: project.id,
        baseRef: branch,
        manifestFingerprint,
        manifestJson,
        projectPath: project.path,
      });
      await refreshWorkspaceList("creating root workspace");
      void navigate(`/workspaces/${workspaceId}`);
    } catch (err) {
      console.error("Failed to add project:", err);
      if (importedProjectId) {
        void navigate(`/?project=${importedProjectId}`);
        alert(`Project was added, but the root workspace could not be created: ${err}`);
        return;
      }

      alert(`Failed to add project: ${err}`);
    }
  }, [client, navigate, refreshWorkspaceList]);

  const handleCreateWorkspace = useCallback(
    async (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;
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
          kind,
          projectId: project.id,
          baseRef: branch,
          manifestFingerprint,
          manifestJson,
          projectPath: project.path,
          worktreeRoot,
        });

        await refreshWorkspaceList("creating workspace");
        void navigate(`/workspaces/${workspaceId}`);
      } catch (err) {
        console.error("Failed to create workspace:", err);
        alert(`Failed to create workspace: ${err}`);
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

  const handleForkWorkspace = useCallback(async () => {
    if (!selectedWorkspace) return;
    const project = projects.find((item) => item.id === selectedWorkspace.project_id);
    if (!project) return;
    const manifestStatus = projectCatalogQuery.data?.manifestsByProjectId[project.id];
    const manifestJson =
      manifestStatus?.state === "valid" ? JSON.stringify(manifestStatus.result.config) : undefined;
    const manifestFingerprint =
      manifestStatus?.state === "valid"
        ? getManifestFingerprint(manifestStatus.result.config)
        : null;

    try {
      const baseRef =
        selectedWorkspace.kind === "root"
          ? await getCurrentBranch(project.path)
          : selectedWorkspace.source_ref;
      const newWorkspaceId = await createWorkspace({
        kind: "managed",
        projectId: project.id,
        baseRef,
        manifestFingerprint,
        manifestJson,
        projectPath: project.path,
        worktreeRoot,
      });

      await refreshWorkspaceList("forking workspace");
      void navigate(`/workspaces/${newWorkspaceId}`);
    } catch (err) {
      console.error("Failed to fork workspace:", err);
      alert(`Failed to fork workspace: ${err}`);
    }
  }, [
    navigate,
    projectCatalogQuery.data,
    projects,
    refreshWorkspaceList,
    selectedWorkspace,
    worktreeRoot,
  ]);

  const handleRemoveProject = useCallback(
    async (projectId: string) => {
      try {
        await removeProject(projectId);
        client.invalidate(projectKeys.catalog());

        if (selectedWorkspace?.project_id === projectId) {
          clearLastWorkspaceId();
          void navigate("/");
          return;
        }

        if (activeProjectId === projectId) {
          void navigate("/");
        }
      } catch (err) {
        console.error("Failed to remove project:", err);
        alert(`Failed to remove project: ${err}`);
      }
    },
    [activeProjectId, client, navigate, selectedWorkspace?.project_id],
  );

  const handleDestroyWorkspace = useCallback(
    async (workspace: (typeof workspaces)[number]) => {
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

        if (readLastWorkspaceId() === workspace.id) {
          clearLastWorkspaceId();
        }

        if (selectedWorkspaceId !== workspace.id) {
          return;
        }

        const nextWorkspace = (workspacesByProjectId[workspace.project_id] ?? []).find(
          (candidate) => candidate.id !== workspace.id,
        );
        if (nextWorkspace) {
          void navigate(`/workspaces/${nextWorkspace.id}`);
          return;
        }

        void navigate(`/?project=${workspace.project_id}`);
      } catch (err) {
        console.error("Failed to archive workspace:", err);
        alert(`Failed to archive workspace: ${err}`);
      }
    },
    [client, navigate, selectedWorkspaceId, workspacesByProjectId],
  );

  const handleOpenSettings = useCallback(() => {
    void navigate("/settings");
  }, [navigate]);

  const handleLeftSidebarSeparatorDoubleClick = useCallback(() => {
    setLeftSidebarCollapsed((c) => !c);
  }, []);

  const handleToggleRightSidebar = useCallback(() => {
    setRightSidebarCollapsed((c) => !c);
  }, []);

  const handleSidebarResizePointerDown = useCallback(
    (side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      notifyShellResizeListeners(true);
      setActiveSidebarResize(side);
    },
    [],
  );

  const handleLeftSidebarSeparatorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setLeftSidebarWidth((current) =>
          clampPanelSize(current - SIDEBAR_RESIZE_STEP, leftSidebarBounds),
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setLeftSidebarWidth((current) =>
          clampPanelSize(current + SIDEBAR_RESIZE_STEP, leftSidebarBounds),
        );
      }

      if (event.key === "Home") {
        event.preventDefault();
        setLeftSidebarWidth(leftSidebarBounds.minSize);
      }

      if (event.key === "End") {
        event.preventDefault();
        setLeftSidebarWidth(leftSidebarBounds.maxSize);
      }
    },
    [leftSidebarBounds],
  );

  const handleRightSidebarSeparatorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setRightSidebarWidth((current) =>
          clampPanelSize(current + SIDEBAR_RESIZE_STEP, rightSidebarBounds),
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setRightSidebarWidth((current) =>
          clampPanelSize(current - SIDEBAR_RESIZE_STEP, rightSidebarBounds),
        );
      }

      if (event.key === "Home") {
        event.preventDefault();
        setRightSidebarWidth(rightSidebarBounds.minSize);
      }

      if (event.key === "End") {
        event.preventDefault();
        setRightSidebarWidth(rightSidebarBounds.maxSize);
      }
    },
    [rightSidebarBounds],
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
      <CommandPaletteProvider onForkWorkspace={handleForkWorkspace}>
        <div className="flex h-full w-full flex-col bg-[var(--background)] text-[var(--foreground)]">
          <AppHotkeyListener />
          <div ref={layoutRowRef} className="flex min-h-0 flex-1">
            <ShellResizeProvider resizing={activeSidebarResize !== null}>
              <div className="flex min-h-0 w-full flex-1">
                <div
                  className={getLeftSidebarRailClassName(activeSidebarResize === "left")}
                  style={{
                    width: getLeftSidebarRailWidth({
                      collapsed: leftSidebarCollapsed,
                      width: leftSidebarWidth,
                    }),
                  }}
                >
                  <Sidebar
                    isLoading={projectCatalogQuery.isLoading || workspacesByProjectQuery.isLoading}
                    projects={projects}
                    workspacesByProjectId={workspacesByProjectId}
                    selectedProjectId={activeProjectId}
                    selectedWorkspaceId={selectedWorkspaceId}
                    onSelectProject={handleSelectProject}
                    onSelectWorkspace={handleSelectWorkspace}
                    onAddProject={handleAddProject}
                    onCreateWorkspace={handleCreateWorkspace}
                    onRemoveProject={handleRemoveProject}
                    onDestroyWorkspace={handleDestroyWorkspace}
                    onOpenSettings={handleOpenSettings}
                  />
                </div>
                <div className="relative w-px shrink-0">
                  <div
                    role="separator"
                    aria-label="Resize workspace list sidebar"
                    aria-orientation="vertical"
                    aria-valuemax={leftSidebarBounds.maxSize}
                    aria-valuemin={leftSidebarBounds.minSize}
                    aria-valuenow={leftSidebarCollapsed ? 0 : leftSidebarWidth}
                    data-no-drag
                    tabIndex={0}
                    onDoubleClick={handleLeftSidebarSeparatorDoubleClick}
                    onKeyDown={handleLeftSidebarSeparatorKeyDown}
                    onPointerDown={(event) => handleSidebarResizePointerDown("left", event)}
                    className="group absolute inset-y-0 left-1/2 z-10 flex w-3 -translate-x-1/2 touch-none cursor-col-resize justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  >
                    <div className="w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--ring)] group-focus-visible:bg-[var(--ring)]" />
                  </div>
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <TitleBar
                    selectedWorkspace={selectedWorkspace}
                    sourceWorkspace={sourceWorkspace}
                    leftSidebarCollapsed={leftSidebarCollapsed}
                    onFork={handleForkWorkspace}
                    onToggleRightSidebar={handleToggleRightSidebar}
                    rightSidebarCollapsed={rightSidebarCollapsed}
                  />
                  <div className="flex min-h-0 min-w-0 flex-1">
                    <SidebarInset>
                      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                        <Outlet context={{ onCreateWorkspace: handleCreateWorkspace }} />
                      </main>
                    </SidebarInset>
                    {showRightSidebar && (
                      <>
                        {!rightSidebarCollapsed && (
                          <div className="relative w-px shrink-0">
                            <div
                              role="separator"
                              aria-label="Resize workspace details sidebar"
                              aria-orientation="vertical"
                              aria-valuemax={rightSidebarBounds.maxSize}
                              aria-valuemin={rightSidebarBounds.minSize}
                              aria-valuenow={rightSidebarWidth}
                              data-no-drag
                              tabIndex={0}
                              onKeyDown={handleRightSidebarSeparatorKeyDown}
                              onPointerDown={(event) =>
                                handleSidebarResizePointerDown("right", event)
                              }
                              className="group absolute inset-y-0 left-1/2 z-10 flex w-3 -translate-x-1/2 touch-none cursor-col-resize justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                            >
                              <div className="w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--ring)] group-focus-visible:bg-[var(--ring)]" />
                            </div>
                          </div>
                        )}
                        <div
                          id="workspace-right-rail"
                          className={`relative flex min-h-0 shrink-0 overflow-hidden bg-[var(--panel)]${activeSidebarResize === "right" ? "" : " transition-[width,transform] duration-200 ease-linear"}`}
                          data-overlay-boundary
                          style={{
                            width: rightSidebarCollapsed ? 0 : `${rightSidebarWidth}px`,
                            transform: rightSidebarCollapsed
                              ? `translateX(${rightSidebarWidth}px)`
                              : undefined,
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </ShellResizeProvider>
          </div>
          <AppStatusBar
            leftSidebarCollapsed={leftSidebarCollapsed}
            onToggleLeftSidebar={handleLeftSidebarSeparatorDoubleClick}
          />
        </div>
      </CommandPaletteProvider>
    </WorkspaceOpenRequestsProvider>
  );
}

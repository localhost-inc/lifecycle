import { useCallback, useEffect, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";
import { SidebarInset, SidebarProvider } from "@lifecycle/ui";
import { Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { addProjectFromDirectory } from "../../features/projects/api/projects";
import { projectKeys, useProjectCatalog } from "../../features/projects/hooks";
import { useSettings } from "../../features/settings/state/app-settings-provider";
import {
  createTerminal,
  DEFAULT_HARNESS_PROVIDER,
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from "../../features/terminals/api";
import { terminalKeys } from "../../features/terminals/hooks";
import { createWorkspace, getCurrentBranch } from "../../features/workspaces/api";
import { useWorkspacesByProject, workspaceKeys } from "../../features/workspaces/hooks";
import {
  clearLastWorkspaceId,
  readLastWorkspaceId,
  writeLastWorkspaceId,
} from "../../features/workspaces/state/workspace-surface-state";
import {
  clampPanelSize,
  DASHBOARD_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
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
import { useStoreClient } from "../../store";
import { Sidebar } from "./sidebar";
import { AppStatusBar } from "./app-status-bar";
import { TitleBar } from "./title-bar";

const SIDEBAR_RESIZE_STEP = 16;

export function DashboardLayout() {
  const client = useStoreClient();
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
  const [activeSidebarResize, setActiveSidebarResize] = useState<"left" | "right" | null>(null);
  const projects = projectCatalogQuery.data?.projects ?? [];
  const workspacesByProjectId = workspacesByProjectQuery.data ?? {};
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
        oppositeSidebarWidth: leftSidebarWidth,
      }),
    [layoutRowWidth, leftSidebarWidth],
  );

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
        setLeftSidebarWidth(
          getLeftSidebarWidthFromPointer(event.clientX, bounds.left, leftSidebarBounds),
        );
        return;
      }

      setRightSidebarWidth(
        getRightSidebarWidthFromPointer(event.clientX, bounds.right, rightSidebarBounds),
      );
    };

    const handlePointerUp = () => {
      setActiveSidebarResize(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [activeSidebarResize, leftSidebarBounds, rightSidebarBounds]);

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

  const handleAddProject = useCallback(async () => {
    try {
      const project = await addProjectFromDirectory();
      if (!project) return;
      client.invalidate(projectKeys.catalog());
      void navigate(`/?project=${project.id}`);
    } catch (err) {
      console.error("Failed to add project:", err);
      alert(`Failed to add project: ${err}`);
    }
  }, [client, navigate]);

  const handleCreateWorkspace = useCallback(
    async (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;

      try {
        const branch = await getCurrentBranch(project.path);
        const workspaceId = await createWorkspace({
          projectId: project.id,
          baseRef: branch,
          projectPath: project.path,
          worktreeRoot,
        });

        void (async () => {
          try {
            await createTerminal({
              cols: DEFAULT_TERMINAL_COLS,
              harnessProvider: DEFAULT_HARNESS_PROVIDER,
              launchType: "harness",
              rows: DEFAULT_TERMINAL_ROWS,
              workspaceId,
            });
            client.invalidate(terminalKeys.byWorkspace(workspaceId));
          } catch (terminalError) {
            console.error("Failed to create initial harness terminal:", terminalError);
            alert(
              `Workspace created, but failed to start the initial ${DEFAULT_HARNESS_PROVIDER} harness: ${terminalError}`,
            );
          }
        })();

        client.invalidate(workspaceKeys.byProject());
        client.invalidate(workspaceKeys.detail(workspaceId));
        void navigate(`/workspaces/${workspaceId}`);
      } catch (err) {
        console.error("Failed to create workspace:", err);
        alert(`Failed to create workspace: ${err}`);
      }
    },
    [client, navigate, projects, worktreeRoot],
  );

  const handleOpenSettings = useCallback(() => {
    void navigate("/settings/general");
  }, [navigate]);

  const handleSidebarResizePointerDown = useCallback(
    (side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
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

  return (
    <div className="flex h-full w-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div ref={layoutRowRef} className="flex min-h-0 flex-1">
        <SidebarProvider
          className="min-h-0 flex-1"
          sidebarWidth={`${leftSidebarWidth}px`}
          sidebarWidthIcon={`${MIN_LEFT_SIDEBAR_WIDTH}px`}
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
            onOpenSettings={handleOpenSettings}
          />
          <div className="relative w-px shrink-0">
            <div
              role="separator"
              aria-label="Resize workspace list sidebar"
              aria-orientation="vertical"
              aria-valuemax={leftSidebarBounds.maxSize}
              aria-valuemin={leftSidebarBounds.minSize}
              aria-valuenow={leftSidebarWidth}
              tabIndex={0}
              onKeyDown={handleLeftSidebarSeparatorKeyDown}
              onPointerDown={(event) => handleSidebarResizePointerDown("left", event)}
              className="group absolute inset-y-0 left-1/2 z-10 flex w-3 -translate-x-1/2 cursor-col-resize justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            >
              <div className="w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--primary)] group-focus-visible:bg-[var(--primary)]" />
            </div>
          </div>
          <SidebarInset>
            <TitleBar selectedWorkspace={selectedWorkspace} />
            <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <Outlet />
            </main>
          </SidebarInset>
          {showRightSidebar && (
            <>
              <div className="relative w-px shrink-0">
                <div
                  role="separator"
                  aria-label="Resize workspace details sidebar"
                  aria-orientation="vertical"
                  aria-valuemax={rightSidebarBounds.maxSize}
                  aria-valuemin={rightSidebarBounds.minSize}
                  aria-valuenow={rightSidebarWidth}
                  tabIndex={0}
                  onKeyDown={handleRightSidebarSeparatorKeyDown}
                  onPointerDown={(event) => handleSidebarResizePointerDown("right", event)}
                  className="group absolute inset-y-0 left-1/2 z-10 flex w-3 -translate-x-1/2 cursor-col-resize justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                >
                  <div className="w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--primary)] group-focus-visible:bg-[var(--primary)]" />
                </div>
              </div>
              <div
                id="workspace-right-rail"
                className="flex min-h-0 shrink-0 bg-[var(--panel)]"
                style={{ width: `${rightSidebarWidth}px` }}
              />
            </>
          )}
        </SidebarProvider>
      </div>
      <AppStatusBar />
    </div>
  );
}

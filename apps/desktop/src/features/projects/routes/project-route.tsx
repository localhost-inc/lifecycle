import type { WorkspaceRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { Activity, GitPullRequest, LayoutGrid, TerminalSquare } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { AppStatusBar } from "../../../components/layout/app-status-bar";
import type { AppShellOutletContext } from "../../../components/layout/app-shell-context";
import { notifyShellResizeListeners } from "../../../components/layout/shell-resize-provider";
import {
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  MAX_RIGHT_SIDEBAR_WIDTH,
  MIN_RIGHT_SIDEBAR_WIDTH,
  PROJECT_WORKSPACE_PANEL_COLLAPSED_STORAGE_KEY,
  PROJECT_WORKSPACE_PANEL_WIDTH_STORAGE_KEY,
  clampPanelSize,
  getRightSidebarWidthFromPointer,
  getSidebarWidthBounds,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "../../../lib/panel-layout";
import { WorkspacePageHeader } from "../../workspaces/components/workspace-page-header";
import { getWorkspaceDisplayName } from "../../workspaces/lib/workspace-display";
import { WorkspaceTabContent } from "../../workspaces/components/workspace-tab-content";
import { ProjectActivitySurface } from "../components/project-activity-surface";
import { ProjectOverviewSurface } from "../components/project-overview-surface";
import { ProjectPageTabs, type ProjectPageTab } from "../components/project-page-tabs";
import { ProjectPullRequestTabContent } from "../components/project-pull-request-tab-content";
import { ProjectPullRequestsSurface } from "../components/project-pull-requests-surface";
import { ProjectSidebar } from "../components/project-sidebar";
import { resolveProjectRepoWorkspace } from "../lib/project-repo-workspace";
import {
  isProjectRouteFocusAvailable,
  projectRouteFocusEqualsTab,
  projectRouteFocusFromTab,
  readProjectRouteFocus,
  updateProjectRouteFocus,
} from "../lib/project-route-state";
import {
  closeProjectContentTab,
  focusProjectViewTab,
  focusPullRequestTab,
  focusWorkspaceTab,
  getActiveProjectContentTab,
  normalizeProjectContentTabsState,
  projectContentTabsStateEquals,
  readProjectContentTabsState,
  reorderProjectContentTabs,
  writeProjectContentTabsState,
} from "../state/project-content-tabs";
import type { ProjectContentTabPlacement } from "../lib/project-content-tab-order";
import type {
  ProjectContentTab,
  ProjectContentTabsState,
  ProjectViewId,
} from "../types/project-content-tabs";

const SIDEBAR_RESIZE_STEP = 16;

function readPersistedWorkspacePanelCollapsed(): boolean {
  try {
    return localStorage.getItem(PROJECT_WORKSPACE_PANEL_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writePersistedWorkspacePanelCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(PROJECT_WORKSPACE_PANEL_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // best-effort persistence
  }
}

function isWorkspaceAvailable(
  workspacesById: ReadonlyMap<string, WorkspaceRecord>,
  workspaceId: string,
): boolean {
  return workspacesById.has(workspaceId);
}

function focusRouteTab(
  state: ProjectContentTabsState,
  routeFocus: ReturnType<typeof readProjectRouteFocus>,
  workspacesById: ReadonlyMap<string, WorkspaceRecord>,
): ProjectContentTabsState {
  if (!routeFocus) {
    return state;
  }

  if (routeFocus.kind === "workspace") {
    return isWorkspaceAvailable(workspacesById, routeFocus.workspaceId)
      ? focusWorkspaceTab(state, routeFocus.workspaceId)
      : focusProjectViewTab(state, "overview");
  }

  if (routeFocus.kind === "pull-request") {
    return focusPullRequestTab(state, routeFocus.pullRequestNumber);
  }

  return focusProjectViewTab(state, routeFocus.viewId);
}

function isOverviewTab(tab: ProjectContentTab): boolean {
  return tab.kind === "project-view" && tab.viewId === "overview";
}

function getProjectViewTabLabel(viewId: ProjectViewId): string {
  if (viewId === "pull-requests") {
    return "Pull Requests";
  }

  if (viewId === "activity") {
    return "Activity";
  }

  return "Overview";
}

function getRouteAlignedTabState({
  availableWorkspaceIds,
  projectId,
  routeFocus,
  workspacesById,
}: {
  availableWorkspaceIds: ReadonlySet<string>;
  projectId: string | undefined;
  routeFocus: ReturnType<typeof readProjectRouteFocus>;
  workspacesById: ReadonlyMap<string, WorkspaceRecord>;
}): ProjectContentTabsState {
  const persistedState = projectId
    ? readProjectContentTabsState(projectId)
    : normalizeProjectContentTabsState(null);

  return focusRouteTab(
    normalizeProjectContentTabsState(persistedState, {
      availableWorkspaceIds,
    }),
    routeFocus,
    workspacesById,
  );
}

export function ProjectRoute() {
  const {
    onCreateWorkspace,
    onDestroyWorkspace,
    onForkWorkspace,
    onOpenWorkspace,
    onToggleProjectNavigation,
    onProjectNavigationResizeKeyDown,
    onProjectNavigationResizePointerDown,
    projects,
    projectNavigationCollapsed,
    projectNavigationWidth,
    workspacesByProjectId,
    onRemoveProject,
  } = useOutletContext<AppShellOutletContext>();
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceContentRowRef = useRef<HTMLDivElement | null>(null);
  const [workspaceContentRowWidth, setWorkspaceContentRowWidth] = useState(0);
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(() =>
    readPersistedPanelValue(PROJECT_WORKSPACE_PANEL_WIDTH_STORAGE_KEY, DEFAULT_RIGHT_SIDEBAR_WIDTH),
  );
  const [workspacePanelCollapsed, setWorkspacePanelCollapsed] = useState(
    readPersistedWorkspacePanelCollapsed,
  );
  const [activeWorkspacePanelResize, setActiveWorkspacePanelResize] = useState(false);
  const project = projects.find((item) => item.id === projectId) ?? null;
  const workspaces = useMemo(() => {
    if (!projectId) {
      return [];
    }

    return workspacesByProjectId[projectId] ?? [];
  }, [projectId, workspacesByProjectId]);
  const availableWorkspaceIds = useMemo(
    () => new Set(workspaces.map((workspace) => workspace.id)),
    [workspaces],
  );
  const workspacesById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const repositoryWorkspace = useMemo(() => resolveProjectRepoWorkspace(workspaces), [workspaces]);
  const routeFocus = useMemo(() => readProjectRouteFocus(searchParams), [searchParams]);
  const routeFocusAvailable = useMemo(
    () =>
      isProjectRouteFocusAvailable(routeFocus, {
        availableWorkspaceIds,
      }),
    [availableWorkspaceIds, routeFocus],
  );
  const [tabState, setTabState] = useState<ProjectContentTabsState>(() =>
    getRouteAlignedTabState({
      availableWorkspaceIds,
      projectId,
      routeFocus,
      workspacesById,
    }),
  );

  useEffect(() => {
    if (!projectId) {
      return;
    }

    setTabState(
      getRouteAlignedTabState({
        availableWorkspaceIds,
        projectId,
        routeFocus,
        workspacesById,
      }),
    );
  }, [availableWorkspaceIds, projectId, routeFocus, workspacesById]);

  useEffect(() => {
    setTabState((currentState) => {
      const nextState = normalizeProjectContentTabsState(currentState, {
        availableWorkspaceIds,
      });
      return projectContentTabsStateEquals(currentState, nextState) ? currentState : nextState;
    });
  }, [availableWorkspaceIds]);

  useEffect(() => {
    setTabState((currentState) => {
      const nextState = focusRouteTab(
        normalizeProjectContentTabsState(currentState, {
          availableWorkspaceIds,
        }),
        routeFocus,
        workspacesById,
      );
      return projectContentTabsStateEquals(currentState, nextState) ? currentState : nextState;
    });
  }, [availableWorkspaceIds, routeFocus, workspacesById]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    writeProjectContentTabsState(projectId, tabState);
  }, [projectId, tabState]);

  const activeTab = useMemo(() => getActiveProjectContentTab(tabState), [tabState]);
  const activeProjectViewTab = activeTab?.kind === "project-view" ? activeTab : null;
  const activeWorkspace =
    activeTab?.kind === "workspace" ? (workspacesById.get(activeTab.workspaceId) ?? null) : null;

  useEffect(() => {
    if (routeFocusAvailable) {
      return;
    }

    const nextFocus = activeTab
      ? projectRouteFocusFromTab(activeTab)
      : {
          kind: "project-view" as const,
          viewId: "overview" as const,
        };
    const nextSearchParams = updateProjectRouteFocus(searchParams, nextFocus);
    if (nextSearchParams.toString() === searchParams.toString()) {
      return;
    }

    setSearchParams(nextSearchParams, { replace: true });
  }, [activeTab, routeFocusAvailable, searchParams, setSearchParams]);

  const handleFocusTab = useCallback(
    (tab: ProjectContentTab, options?: { replace?: boolean }) => {
      const nextSearchParams = updateProjectRouteFocus(searchParams, projectRouteFocusFromTab(tab));
      if (nextSearchParams.toString() === searchParams.toString()) {
        return;
      }

      setSearchParams(nextSearchParams, options);
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const row = workspaceContentRowRef.current;
    if (!row) {
      return;
    }

    const syncWidth = () => setWorkspaceContentRowWidth(row.getBoundingClientRect().width);

    syncWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);
      return () => window.removeEventListener("resize", syncWidth);
    }

    const observer = new ResizeObserver(() => syncWidth());
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const workspacePanelBounds = useMemo(
    () =>
      getSidebarWidthBounds({
        containerWidth: workspaceContentRowWidth,
        maxWidth: MAX_RIGHT_SIDEBAR_WIDTH,
        minWidth: MIN_RIGHT_SIDEBAR_WIDTH,
        oppositeSidebarWidth: 0,
      }),
    [workspaceContentRowWidth],
  );

  useEffect(() => {
    setWorkspacePanelWidth((currentWidth) => {
      const nextWidth = clampPanelSize(currentWidth, workspacePanelBounds);
      return nextWidth === currentWidth ? currentWidth : nextWidth;
    });
  }, [workspacePanelBounds]);

  useEffect(() => {
    writePersistedPanelValue(
      PROJECT_WORKSPACE_PANEL_WIDTH_STORAGE_KEY,
      clampPanelSize(workspacePanelWidth, workspacePanelBounds),
    );
  }, [workspacePanelBounds, workspacePanelWidth]);

  useEffect(() => {
    writePersistedWorkspacePanelCollapsed(workspacePanelCollapsed);
  }, [workspacePanelCollapsed]);

  useEffect(() => {
    if (!activeWorkspacePanelResize) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const row = workspaceContentRowRef.current;
      if (!row) {
        return;
      }

      const bounds = row.getBoundingClientRect();
      setWorkspacePanelWidth(
        getRightSidebarWidthFromPointer(event.clientX, bounds.right, workspacePanelBounds),
      );
    };

    const handlePointerUp = () => {
      notifyShellResizeListeners(false);
      setActiveWorkspacePanelResize(false);
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
  }, [activeWorkspacePanelResize, workspacePanelBounds]);

  useEffect(() => {
    if (!activeWorkspacePanelResize) {
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
  }, [activeWorkspacePanelResize]);

  const handleWorkspacePanelResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      notifyShellResizeListeners(true);
      setActiveWorkspacePanelResize(true);
    },
    [],
  );

  const handleWorkspacePanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWorkspacePanelWidth((currentWidth) =>
          clampPanelSize(currentWidth + SIDEBAR_RESIZE_STEP, workspacePanelBounds),
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setWorkspacePanelWidth((currentWidth) =>
          clampPanelSize(currentWidth - SIDEBAR_RESIZE_STEP, workspacePanelBounds),
        );
      }

      if (event.key === "Home") {
        event.preventDefault();
        setWorkspacePanelWidth(workspacePanelBounds.minSize);
      }

      if (event.key === "End") {
        event.preventDefault();
        setWorkspacePanelWidth(workspacePanelBounds.maxSize);
      }
    },
    [workspacePanelBounds],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const nextTab = tabState.tabs.find((tab) => tab.id === tabId);
      if (!nextTab) {
        return;
      }

      setTabState((currentState) => ({
        ...currentState,
        activeTabId: tabId,
      }));

      if (!projectRouteFocusEqualsTab(routeFocus, nextTab)) {
        handleFocusTab(nextTab);
      }
    },
    [handleFocusTab, routeFocus, tabState.tabs],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const nextState = closeProjectContentTab(tabState, tabId);
      setTabState(nextState);

      const nextActiveTab = getActiveProjectContentTab(nextState);
      if (!nextActiveTab || projectRouteFocusEqualsTab(routeFocus, nextActiveTab)) {
        return;
      }

      handleFocusTab(nextActiveTab, { replace: true });
    },
    [handleFocusTab, routeFocus, tabState],
  );

  const handleReorderTabs = useCallback(
    (draggedTabId: string, targetTabId: string, placement: ProjectContentTabPlacement) => {
      setTabState((currentState) =>
        reorderProjectContentTabs(currentState, draggedTabId, targetTabId, placement),
      );
    },
    [],
  );

  const handleOpenProjectView = useCallback(
    (viewId: ProjectViewId) => {
      setTabState((currentState) => focusProjectViewTab(currentState, viewId));
      handleFocusTab({ id: `view:${viewId}`, kind: "project-view", viewId });
    },
    [handleFocusTab],
  );

  const handleOpenWorkspaceFromOverview = useCallback(
    (workspace: WorkspaceRecord) => {
      onOpenWorkspace(workspace);
    },
    [onOpenWorkspace],
  );

  const handleOpenPullRequestTab = useCallback(
    (pullRequestNumber: number) => {
      const nextTab: ProjectContentTab = {
        id: `pull-request:${pullRequestNumber}`,
        kind: "pull-request",
        pullRequestNumber,
      };

      setTabState((currentState) => focusPullRequestTab(currentState, pullRequestNumber));
      handleFocusTab(nextTab);
    },
    [handleFocusTab],
  );

  const handleOpenPullRequestSummary = useCallback(
    (pullRequest: { number: number }) => {
      handleOpenPullRequestTab(pullRequest.number);
    },
    [handleOpenPullRequestTab],
  );

  const pageTabs = useMemo<ProjectPageTab[]>(
    () =>
      tabState.tabs.map((tab) => ({
        closable: !isOverviewTab(tab),
        id: tab.id,
        icon:
          tab.kind === "workspace" ? (
            <TerminalSquare className="size-3.5" strokeWidth={2} />
          ) : tab.kind === "pull-request" ? (
            <GitPullRequest className="size-3.5" strokeWidth={2} />
          ) : tab.viewId === "activity" ? (
            <Activity className="size-3.5" strokeWidth={2} />
          ) : tab.viewId === "pull-requests" ? (
            <GitPullRequest className="size-3.5" strokeWidth={2} />
          ) : (
            <LayoutGrid className="size-3.5" strokeWidth={2} />
          ),
        label:
          tab.kind === "workspace"
            ? getWorkspaceDisplayName(
                workspacesById.get(tab.workspaceId) ?? {
                  kind: "managed",
                  name: "Workspace",
                  source_ref: "workspace",
                },
              )
            : tab.kind === "pull-request"
              ? `PR #${tab.pullRequestNumber}`
              : getProjectViewTabLabel(tab.viewId),
      })),
    [tabState.tabs, workspacesById],
  );

  if (!project) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-8">
        <EmptyState
          description="Choose a project from the shell switcher to open the project shell."
          title="Project not found"
        />
      </div>
    );
  }

  const activeViewId = activeTab?.kind === "project-view" ? activeTab.viewId : null;
  const selectedWorkspaceId =
    activeWorkspace?.id ?? (routeFocus?.kind === "workspace" ? routeFocus.workspaceId : null);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-slot="project-shell">
      <div className="min-h-0 flex-1">
        <div
          className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--project-shell-radius)] border border-[color-mix(in_srgb,var(--border),var(--foreground)_12%)] bg-[var(--background)] shadow-[0_16px_36px_rgba(0,0,0,0.12)]"
          data-slot="project-surface"
        >
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {!projectNavigationCollapsed ? (
              <>
                <div
                  className="min-h-0 shrink-0 border-r border-[var(--border)]"
                  style={{ width: `${projectNavigationWidth}px` }}
                >
                  <ProjectSidebar
                    activeViewId={activeViewId}
                    onCreateWorkspace={() => void onCreateWorkspace(project.id)}
                    onDestroyWorkspace={(workspace) => void onDestroyWorkspace(workspace)}
                    onOpenProjectView={handleOpenProjectView}
                    onOpenWorkspace={(workspace) => onOpenWorkspace(workspace)}
                    onRemoveProject={() => void onRemoveProject(project.id)}
                    project={project}
                    selectedWorkspaceId={selectedWorkspaceId}
                    workspaces={workspaces}
                  />
                </div>
                <div className="relative w-px shrink-0">
                  <div
                    aria-label="Resize project navigation"
                    aria-orientation="vertical"
                    className="absolute inset-y-0 -left-2 w-4 cursor-col-resize"
                    onKeyDown={onProjectNavigationResizeKeyDown}
                    onPointerDown={onProjectNavigationResizePointerDown}
                    role="separator"
                    tabIndex={0}
                  />
                </div>
              </>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ProjectPageTabs
                activeTabId={activeTab?.id ?? tabState.activeTabId}
                onCloseTab={handleCloseTab}
                onReorderTabs={handleReorderTabs}
                onSelectTab={handleSelectTab}
                tabs={pageTabs}
              />
              {activeWorkspace ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <WorkspacePageHeader
                    onFork={() => void onForkWorkspace(activeWorkspace)}
                    onToggleRightSidebar={() => setWorkspacePanelCollapsed((current) => !current)}
                    rightSidebarCollapsed={workspacePanelCollapsed}
                    workspace={activeWorkspace}
                  />
                  <div ref={workspaceContentRowRef} className="flex min-h-0 min-w-0 flex-1">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <WorkspaceTabContent
                        onOpenPullRequest={handleOpenPullRequestSummary}
                        workspaceId={activeWorkspace.id}
                      />
                    </div>
                    {!workspacePanelCollapsed ? (
                      <>
                        <div className="relative w-px shrink-0">
                          <div
                            aria-label="Resize workspace panel"
                            aria-orientation="vertical"
                            className="absolute inset-y-0 -left-2 w-4 cursor-col-resize"
                            onKeyDown={handleWorkspacePanelResizeKeyDown}
                            onPointerDown={handleWorkspacePanelResizePointerDown}
                            role="separator"
                            tabIndex={0}
                          />
                        </div>
                        <aside
                          className="min-h-0 shrink-0 border-l border-[var(--border)] bg-[var(--panel)]"
                          id="workspace-right-rail"
                          style={{ width: `${workspacePanelWidth}px` }}
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div ref={workspaceContentRowRef} className="flex min-h-0 min-w-0 flex-1">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {activeTab?.kind === "pull-request" ? (
                      <ProjectPullRequestTabContent
                        projectName={project.name}
                        pullRequestNumber={activeTab.pullRequestNumber}
                        repositoryWorkspace={repositoryWorkspace}
                      />
                    ) : activeProjectViewTab?.viewId === "pull-requests" ? (
                      <ProjectPullRequestsSurface
                        onOpenPullRequest={handleOpenPullRequestTab}
                        projectName={project.name}
                        repositoryWorkspace={repositoryWorkspace}
                      />
                    ) : activeProjectViewTab?.viewId === "activity" ? (
                      <ProjectActivitySurface
                        onOpenWorkspace={handleOpenWorkspaceFromOverview}
                        workspaces={workspaces}
                      />
                    ) : (
                      <ProjectOverviewSurface
                        onCreateWorkspace={() => void onCreateWorkspace(project.id)}
                        onOpenWorkspace={handleOpenWorkspaceFromOverview}
                        project={project}
                        workspaces={workspaces}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <AppStatusBar
            onToggleProjectNavigation={onToggleProjectNavigation}
            projectNavigationCollapsed={projectNavigationCollapsed}
          />
        </div>
      </div>
    </div>
  );
}

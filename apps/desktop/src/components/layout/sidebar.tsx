import { isTauri } from "@tauri-apps/api/core";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  Loading,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@lifecycle/ui";
import { FolderPlus, Settings } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useHistoryAvailability } from "../../app/history-stack";
import { ProjectItem } from "../../features/projects/components/project-item";
import { useTerminalResponseReady } from "../../features/terminals/state/terminal-response-ready-provider";
import { WorkspaceTreeItem } from "../../features/workspaces/components/workspace-tree-item";

interface SidebarProps {
  isLoading?: boolean;
  projects: ProjectRecord[];
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
  selectedProjectId: string | null;
  selectedWorkspaceId: string | null;
  onSelectProject: (projectId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onAddProject: () => void;
  onCreateWorkspace: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => void;
  onOpenSettings: () => void;
}

export function createWorkspaceSelectionHandler(
  workspaceId: string,
  onSelectWorkspace: (workspaceId: string) => void,
): () => void {
  return () => {
    onSelectWorkspace(workspaceId);
  };
}

export function detectPlatformHint(): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  const userAgentDataPlatform =
    "userAgentData" in navigator &&
    typeof navigator.userAgentData === "object" &&
    navigator.userAgentData !== null &&
    "platform" in navigator.userAgentData
      ? String(navigator.userAgentData.platform)
      : undefined;

  return (userAgentDataPlatform ?? navigator.platform ?? navigator.userAgent).trim().toLowerCase();
}

export function shouldInsetSidebarHeaderForWindowControls(
  platformHint: string | null | undefined,
  tauriEnvironment: boolean,
): boolean {
  if (!tauriEnvironment) {
    return false;
  }

  return platformHint?.trim().toLowerCase().includes("mac") ?? false;
}

export function getSidebarHeaderClassName(shouldInsetForWindowControls: boolean): string {
  if (shouldInsetForWindowControls) {
    return "flex flex-col gap-3 px-3 pb-3 pt-4";
  }

  return "flex items-center justify-between px-3 py-3";
}

export function Sidebar({
  isLoading = false,
  projects,
  workspacesByProjectId,
  selectedProjectId,
  selectedWorkspaceId,
  onSelectProject,
  onSelectWorkspace,
  onAddProject,
  onCreateWorkspace,
  onRemoveProject,
  onDestroyWorkspace,
  onOpenSettings,
}: SidebarProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryAvailability();
  const shouldInsetSidebarHeader = shouldInsetSidebarHeaderForWindowControls(
    detectPlatformHint(),
    isTauri(),
  );
  const { hasWorkspaceResponseReady, hasWorkspaceRunningTurn } = useTerminalResponseReady();
  const goBack = useCallback(() => {
    if (!canGoBack) return;
    navigate(-1);
  }, [canGoBack, navigate]);
  const goForward = useCallback(() => {
    if (!canGoForward) return;
    navigate(1);
  }, [canGoForward, navigate]);
  const historyActions = (
    <>
      <Button
        aria-label="Go back"
        className="h-6 w-6 p-0"
        onClick={goBack}
        disabled={!canGoBack}
        size="icon"
        variant="ghost"
      >
        ←
      </Button>
      <Button
        aria-label="Go forward"
        className="h-6 w-6 p-0"
        onClick={goForward}
        disabled={!canGoForward}
        size="icon"
        variant="ghost"
      >
        →
      </Button>
    </>
  );
  const addProjectAction = (
    <Button
      className="h-6 w-6 p-0"
      onClick={onAddProject}
      size="icon"
      title="Add project"
      variant="ghost"
    >
      <FolderPlus size={16} />
    </Button>
  );

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--sidebar-background)] text-[var(--sidebar-foreground)]">
      <SidebarHeader
        className={getSidebarHeaderClassName(shouldInsetSidebarHeader)}
        data-tauri-drag-region
      >
        {shouldInsetSidebarHeader ? (
          <>
            <div data-no-drag className="flex min-h-6 items-center justify-end gap-1">
              {historyActions}
            </div>
            <div className="flex items-center justify-between">
              <h1 className="app-panel-title">Workspaces</h1>
              <div data-no-drag className="-mr-1.5">
                {addProjectAction}
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="app-panel-title">Workspaces</h1>
            <div data-no-drag className="flex items-center gap-1">
              {historyActions}
              {addProjectAction}
            </div>
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="px-3 py-1">
        {isLoading && projects.length === 0 ? (
          <Loading message="Loading projects..." className="py-4" />
        ) : projects.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-[var(--muted-foreground)]">
            No projects yet
          </p>
        ) : (
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-3">
                {projects.map((project) => {
                  const workspaces = workspacesByProjectId[project.id] ?? [];
                  return (
                    <SidebarMenuItem key={project.id}>
                      <Collapsible defaultOpen className="group/project w-full">
                        <ProjectItem
                          project={project}
                          selected={project.id === selectedProjectId}
                          onSelect={() => onSelectProject(project.id)}
                          onCreateWorkspace={() => onCreateWorkspace(project.id)}
                          onRemoveProject={() => onRemoveProject(project.id)}
                        />

                        {workspaces.length > 0 && (
                          <CollapsibleContent>
                            <SidebarMenuSub className="ml-0 mt-0 gap-0 border-l-0 pl-0">
                              {workspaces.map((workspace) => (
                                <SidebarMenuSubItem key={workspace.id}>
                                  <WorkspaceTreeItem
                                    running={hasWorkspaceRunningTurn(workspace.id)}
                                    responseReady={hasWorkspaceResponseReady(workspace.id)}
                                    workspace={workspace}
                                    selected={workspace.id === selectedWorkspaceId}
                                    onDestroy={() => onDestroyWorkspace(workspace)}
                                    onSelect={createWorkspaceSelectionHandler(
                                      workspace.id,
                                      onSelectWorkspace,
                                    )}
                                  />
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        )}
                      </Collapsible>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenSettings} className="text-[var(--muted-foreground)]">
              <Settings size={16} />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </aside>
  );
}

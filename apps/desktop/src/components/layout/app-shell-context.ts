import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { ProjectCatalog } from "@/features/projects/hooks";
import type { ShellContext } from "@/features/projects/lib/shell-context";

export interface AppShellOutletContext {
  activeShellContext: ShellContext;
  projectCatalog: ProjectCatalog | undefined;
  projects: ProjectRecord[];
  sidebarCollapsed: boolean;
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
  onCreateWorkspace: (projectId: string) => Promise<void>;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onForkWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenSettings: () => void;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onRemoveProject: (projectId: string) => Promise<void>;
  onToggleSidebar: () => void;
}

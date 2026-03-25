import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { ProjectCatalog } from "@/features/projects/hooks";
import type { ShellContext } from "@/features/projects/lib/shell-context";
import type { WorkspaceCreateMode } from "@/features/workspaces/api";

export interface AppShellOutletContext {
  activeShellContext: ShellContext;
  projectCatalog: ProjectCatalog | undefined;
  projects: ProjectRecord[];
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
  onCreateWorkspace: (projectId: string, mode: WorkspaceCreateMode) => Promise<void>;
  onArchiveWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenSettings: () => void;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onRemoveProject: (projectId: string) => Promise<void>;
}

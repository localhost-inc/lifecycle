import type { RepositoryRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { RepositoryCatalog } from "@/features/repositories/hooks";
import type { ShellContext } from "@/features/repositories/lib/shell-context";
import type { WorkspaceCreateMode } from "@/features/workspaces/types";

export interface AppShellOutletContext {
  activeShellContext: ShellContext;
  repositoryCatalog: RepositoryCatalog | undefined;
  repositories: RepositoryRecord[];
  workspacesByRepositoryId: Record<string, WorkspaceRecord[]>;
  onCreateWorkspace: (repositoryId: string, mode: WorkspaceCreateMode) => Promise<void>;
  onArchiveWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenSettings: () => void;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onRemoveRepository: (repositoryId: string) => Promise<void>;
}

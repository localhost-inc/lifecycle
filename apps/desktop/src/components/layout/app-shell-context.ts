import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { ProjectCatalog } from "../../features/projects/hooks";
import type { ShellContext } from "../../features/projects/lib/shell-context";

export interface AppShellOutletContext {
  activeShellContext: ShellContext;
  projectNavigationCollapsed: boolean;
  projectNavigationWidth: number;
  projectCatalog: ProjectCatalog | undefined;
  projects: ProjectRecord[];
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
  onCreateWorkspace: (projectId: string) => Promise<void>;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onForkWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onToggleProjectNavigation: () => void;
  onProjectNavigationResizeKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onProjectNavigationResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRemoveProject: (projectId: string) => Promise<void>;
}

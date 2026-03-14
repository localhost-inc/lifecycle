import type { WorkspaceRecord } from "@lifecycle/contracts";
import { TitleBarActions } from "../../../components/layout/title-bar-actions";
import { getWorkspaceDisplayName } from "../lib/workspace-display";

interface WorkspacePageHeaderProps {
  onFork?: () => void;
  onToggleRightSidebar?: () => void;
  rightSidebarCollapsed?: boolean;
  workspace: WorkspaceRecord;
}

export function WorkspacePageHeader({
  onFork,
  onToggleRightSidebar,
  rightSidebarCollapsed,
  workspace,
}: WorkspacePageHeaderProps) {
  const displayName = getWorkspaceDisplayName(workspace);
  const sourceRef = workspace.source_ref.trim();
  const secondaryLabel =
    sourceRef.length > 0 && sourceRef !== displayName ? sourceRef : `${workspace.kind} workspace`;

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--background)] px-4"
      data-slot="workspace-page-header"
    >
      <div className="min-w-0">
        <div className="app-panel-title truncate text-[var(--muted-foreground)]">Workspace</div>
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-lg font-semibold text-[var(--foreground)]">{displayName}</h1>
          <p className="truncate text-sm text-[var(--muted-foreground)]">{secondaryLabel}</p>
        </div>
      </div>
      <TitleBarActions
        onFork={onFork}
        onToggleRightSidebar={onToggleRightSidebar}
        rightSidebarCollapsed={rightSidebarCollapsed}
        workspace={workspace}
      />
    </header>
  );
}

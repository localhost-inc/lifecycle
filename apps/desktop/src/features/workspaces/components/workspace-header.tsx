import type { WorkspaceRecord } from "@lifecycle/contracts";
import { TitleBarActions } from "../../../components/layout/title-bar-actions";
import { getWorkspaceDisplayName } from "../lib/workspace-display";

interface WorkspaceHeaderProps {
  onFork?: () => void;
  workspace: WorkspaceRecord;
}

export function WorkspaceHeader({ onFork, workspace }: WorkspaceHeaderProps) {
  const displayName = getWorkspaceDisplayName(workspace);
  const sourceRef = workspace.source_ref.trim();
  const secondaryLabel =
    sourceRef.length > 0 && sourceRef !== displayName ? sourceRef : `${workspace.kind} workspace`;

  return (
    <header
      className="relative z-10 flex shrink-0 items-center justify-between gap-4 px-2 py-1.5"
      data-slot="workspace-header"
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-lg font-semibold text-[var(--foreground)]">{displayName}</h1>
        <p className="truncate text-sm text-[var(--muted-foreground)]">{secondaryLabel}</p>
      </div>
      <TitleBarActions onFork={onFork} workspace={workspace} />
    </header>
  );
}

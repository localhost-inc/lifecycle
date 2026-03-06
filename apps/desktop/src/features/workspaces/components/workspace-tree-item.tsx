import type { WorkspaceStatus } from "@lifecycle/contracts";
import type { WorkspaceRow } from "../api";
import { WorkspaceBadge } from "./workspace-badge";

interface WorkspaceTreeItemProps {
  workspace: WorkspaceRow;
  selected: boolean;
  onSelect: () => void;
}

export function WorkspaceTreeItem({ workspace, selected, onSelect }: WorkspaceTreeItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left transition-colors ${
        selected
          ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"
      }`}
      title={workspace.source_ref}
    >
      <span className="truncate text-xs font-medium">{workspace.source_ref}</span>
      <WorkspaceBadge status={workspace.status as WorkspaceStatus} />
    </button>
  );
}

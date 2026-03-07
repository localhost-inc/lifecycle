import type { WorkspaceStatus } from "@lifecycle/contracts";
import { formatCompactRelativeTime } from "../../../lib/format";
import type { WorkspaceRow } from "../api";

const dotStyles: Record<WorkspaceStatus, string> = {
  creating: "bg-amber-500 animate-pulse",
  starting: "bg-blue-500 animate-pulse",
  ready: "bg-emerald-500",
  resetting: "bg-amber-500 animate-pulse",
  sleeping: "bg-zinc-400",
  destroying: "bg-red-500 animate-pulse",
  failed: "bg-red-500",
};

const dotLabels: Record<WorkspaceStatus, string> = {
  creating: "Creating",
  starting: "Starting",
  ready: "Ready",
  resetting: "Resetting",
  sleeping: "Sleeping",
  destroying: "Destroying",
  failed: "Failed",
};

interface WorkspaceTreeItemProps {
  workspace: WorkspaceRow;
  selected: boolean;
  onSelect: () => void;
}

export function WorkspaceTreeItem({ workspace, selected, onSelect }: WorkspaceTreeItemProps) {
  const status = workspace.status as WorkspaceStatus;
  const timestamp = formatCompactRelativeTime(workspace.last_active_at);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-1.5 py-1 pl-[18px] pr-2 text-left transition-colors ${
        selected
          ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
          : "text-[var(--sidebar-muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      }`}
      title={workspace.source_ref}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotStyles[status]}`}
        title={dotLabels[status]}
      />
      <span className="flex-1 truncate text-sm">{workspace.source_ref}</span>
      {timestamp && (
        <span
          className={`shrink-0 text-xs ${
            selected ? "text-[var(--foreground)] opacity-70" : "text-[var(--sidebar-muted-foreground)]"
          }`}
        >
          {timestamp}
        </span>
      )}
    </button>
  );
}

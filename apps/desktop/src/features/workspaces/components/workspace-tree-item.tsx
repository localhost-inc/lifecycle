import type { WorkspaceStatus } from "@lifecycle/contracts";
import {
  cn,
  sidebarMenuSubButtonVariants,
  StatusDot,
  type StatusDotTone,
} from "@lifecycle/ui";
import { formatCompactRelativeTime } from "../../../lib/format";
import type { WorkspaceRow } from "../api";

const dotTone: Record<WorkspaceStatus, StatusDotTone> = {
  creating: "warning",
  starting: "info",
  ready: "success",
  resetting: "warning",
  sleeping: "neutral",
  destroying: "danger",
  failed: "danger",
};

const dotPulse: Record<WorkspaceStatus, boolean> = {
  creating: true,
  starting: true,
  ready: false,
  resetting: true,
  sleeping: false,
  destroying: true,
  failed: false,
};

const dotClassName: Partial<Record<WorkspaceStatus, string>> = {
  sleeping: "bg-zinc-400",
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
      className={cn(sidebarMenuSubButtonVariants({ active: selected }), "gap-1.5 pl-[18px] pr-2")}
      onClick={onSelect}
      title={workspace.source_ref}
      type="button"
    >
      <StatusDot
        className={dotClassName[status]}
        pulse={dotPulse[status]}
        size="sm"
        title={dotLabels[status]}
        tone={dotTone[status]}
      />
      <span className="flex-1 truncate text-sm">{workspace.source_ref}</span>
      {timestamp && (
        <span
          className={`shrink-0 text-xs ${
            selected
              ? "text-[var(--sidebar-foreground)] opacity-70"
              : "text-[var(--sidebar-muted-foreground)]"
          }`}
        >
          {timestamp}
        </span>
      )}
    </button>
  );
}

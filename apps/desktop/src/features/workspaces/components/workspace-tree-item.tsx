import type { WorkspaceStatus } from "@lifecycle/contracts";
import { cn, sidebarMenuSubButtonVariants, StatusDot, type StatusDotTone } from "@lifecycle/ui";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
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
  responseReady?: boolean;
  workspace: WorkspaceRow;
  selected: boolean;
  onSelect: () => void;
}

export function WorkspaceTreeItem({
  responseReady = false,
  workspace,
  selected,
  onSelect,
}: WorkspaceTreeItemProps) {
  const status = workspace.status as WorkspaceStatus;
  const timestamp = formatCompactRelativeTime(workspace.last_active_at);

  return (
    <button
      className={cn(
        sidebarMenuSubButtonVariants({ active: selected }),
        "relative gap-1.5 border-l-2 pl-[16px] pr-2",
        selected
          ? "border-l-[var(--sidebar-foreground)]"
          : "border-l-[var(--sidebar-foreground)]/20",
      )}
      onClick={onSelect}
      title={workspace.source_ref}
      type="button"
    >
      {responseReady && (
        <ResponseReadyDot className="absolute left-1 top-1/2 -translate-y-1/2" />
      )}
      <StatusDot
        className={dotClassName[status]}
        pulse={dotPulse[status]}
        size="sm"
        title={dotLabels[status]}
        tone={dotTone[status]}
      />
      <span className="flex-1 truncate text-[13px]">{workspace.source_ref}</span>
      {timestamp && (
        <span
          className={`shrink-0 text-[13px] ${
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

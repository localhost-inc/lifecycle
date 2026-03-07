import type { WorkspaceStatus } from "@lifecycle/contracts";

const dotStyles: Record<WorkspaceStatus, string> = {
  creating: "bg-amber-500 animate-pulse",
  starting: "bg-blue-500 animate-pulse",
  ready: "bg-emerald-500",
  resetting: "bg-amber-500 animate-pulse",
  sleeping: "bg-slate-500",
  destroying: "bg-red-500 animate-pulse",
  failed: "bg-red-500",
};

const labels: Record<WorkspaceStatus, string> = {
  creating: "Creating",
  starting: "Starting",
  ready: "Ready",
  resetting: "Resetting",
  sleeping: "Sleeping",
  destroying: "Destroying",
  failed: "Failed",
};

export function WorkspaceBadge({ status }: { status: WorkspaceStatus }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${dotStyles[status]}`}
      title={labels[status]}
    />
  );
}

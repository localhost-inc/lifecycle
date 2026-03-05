import type { WorkspaceStatus } from "@lifecycle/contracts";

const styles: Record<WorkspaceStatus, string> = {
  creating: "bg-amber-100 text-amber-700 animate-pulse",
  starting: "bg-blue-100 text-blue-700 animate-pulse",
  ready: "bg-emerald-100 text-emerald-700",
  resetting: "bg-amber-100 text-amber-700 animate-pulse",
  sleeping: "bg-stone-100 text-stone-500",
  destroying: "bg-red-100 text-red-700 animate-pulse",
  failed: "bg-red-100 text-red-700",
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
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

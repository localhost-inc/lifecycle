import type { WorkspaceStatus } from "@lifecycle/contracts";

const styles: Record<WorkspaceStatus, string> = {
  creating: "bg-amber-500/10 text-amber-400 animate-pulse",
  starting: "bg-blue-500/10 text-blue-400 animate-pulse",
  ready: "bg-emerald-500/10 text-emerald-400",
  resetting: "bg-amber-500/10 text-amber-400 animate-pulse",
  sleeping: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  destroying: "bg-red-500/10 text-red-400 animate-pulse",
  failed: "bg-red-500/10 text-red-400",
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

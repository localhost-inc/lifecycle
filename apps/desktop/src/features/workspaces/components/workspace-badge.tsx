import { StatusDot, type StatusDotTone } from "@lifecycle/ui";
import type { WorkspaceStatus } from "@lifecycle/contracts";

const dotTones: Record<WorkspaceStatus, StatusDotTone> = {
  idle: "neutral",
  starting: "info",
  active: "success",
  stopping: "warning",
};

const labels: Record<WorkspaceStatus, string> = {
  idle: "Idle",
  starting: "Starting",
  active: "Active",
  stopping: "Stopping",
};

export function WorkspaceBadge({ status }: { status: WorkspaceStatus }) {
  return (
    <StatusDot
      pulse={status === "starting" || status === "stopping"}
      title={labels[status]}
      tone={dotTones[status]}
    />
  );
}

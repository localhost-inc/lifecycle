import { StatusDot, type StatusDotTone } from "@lifecycle/ui";
import type { WorkspaceStatus } from "@lifecycle/contracts";

const dotTones: Record<WorkspaceStatus, StatusDotTone> = {
  creating: "warning",
  starting: "info",
  ready: "success",
  resetting: "warning",
  sleeping: "neutral",
  destroying: "danger",
  failed: "danger",
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
    <StatusDot
      pulse={
        status === "creating" ||
        status === "starting" ||
        status === "resetting" ||
        status === "destroying"
      }
      title={labels[status]}
      tone={dotTones[status]}
    />
  );
}

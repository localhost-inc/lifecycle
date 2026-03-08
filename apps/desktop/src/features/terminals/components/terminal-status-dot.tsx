import { StatusDot, type StatusDotTone } from "@lifecycle/ui";
import type { TerminalStatus } from "@lifecycle/contracts";

const STATUS_TONES: Record<TerminalStatus, StatusDotTone> = {
  active: "success",
  detached: "warning",
  failed: "danger",
  finished: "neutral",
  sleeping: "info",
};

interface TerminalStatusDotProps {
  status: TerminalStatus;
}

export function TerminalStatusDot({ status }: TerminalStatusDotProps) {
  return <StatusDot title={status} tone={STATUS_TONES[status]} />;
}

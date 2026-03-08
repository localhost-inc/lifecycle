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
  className?: string;
  size?: "default" | "sm";
  status: TerminalStatus;
}

export function TerminalStatusDot({
  className,
  size = "default",
  status,
}: TerminalStatusDotProps) {
  return <StatusDot className={className} size={size} title={status} tone={STATUS_TONES[status]} />;
}

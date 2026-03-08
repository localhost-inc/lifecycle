import { Badge } from "@lifecycle/ui";
import type { TerminalStatus } from "@lifecycle/contracts";

interface TerminalStatusBadgeProps {
  status: TerminalStatus;
}

const STATUS_VARIANTS: Record<TerminalStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  active: "success",
  detached: "warning",
  failed: "destructive",
  finished: "muted",
  sleeping: "info",
};

export function TerminalStatusBadge({ status }: TerminalStatusBadgeProps) {
  return (
    <Badge className="tracking-[0.18em] uppercase" variant={STATUS_VARIANTS[status]}>
      {status}
    </Badge>
  );
}

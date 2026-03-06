import type { TerminalStatus } from "@lifecycle/contracts";

const STATUS_COLORS: Record<TerminalStatus, string> = {
  active: "bg-emerald-500",
  detached: "bg-amber-500",
  failed: "bg-red-500",
  finished: "bg-slate-500",
  sleeping: "bg-blue-500",
};

interface TerminalStatusDotProps {
  status: TerminalStatus;
}

export function TerminalStatusDot({ status }: TerminalStatusDotProps) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[status]}`}
      title={status}
    />
  );
}

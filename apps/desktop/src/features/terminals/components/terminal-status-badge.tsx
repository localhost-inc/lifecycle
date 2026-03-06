import type { TerminalStatus } from "@lifecycle/contracts";

interface TerminalStatusBadgeProps {
  status: TerminalStatus;
}

const STATUS_STYLES: Record<TerminalStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  detached: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
  finished: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  sleeping: "border-blue-500/30 bg-blue-500/10 text-blue-300",
};

export function TerminalStatusBadge({ status }: TerminalStatusBadgeProps) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

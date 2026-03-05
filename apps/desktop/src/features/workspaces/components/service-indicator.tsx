import type { ServiceRow } from "../api/workspaces";

const statusIcon: Record<string, string> = {
  stopped: "○",
  starting: "◌",
  ready: "●",
  failed: "✕",
};

const statusColor: Record<string, string> = {
  stopped: "text-[var(--muted-foreground)]",
  starting: "text-blue-500 animate-pulse",
  ready: "text-emerald-500",
  failed: "text-red-500",
};

export function ServiceIndicator({ service }: { service: ServiceRow }) {
  const icon = statusIcon[service.status] ?? "?";
  const color = statusColor[service.status] ?? "text-stone-400";

  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`text-sm ${color}`}>{icon}</span>
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">{service.service_name}</p>
          {service.effective_port && (
            <p className="text-xs text-[var(--muted-foreground)]">:{service.effective_port}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {service.status_reason && (
          <span className="text-xs text-red-600">{service.status_reason}</span>
        )}
        <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs text-[var(--muted-foreground)]">
          {service.status}
        </span>
      </div>
    </div>
  );
}

import type { ServiceRow } from "../api";

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

interface ServicesTabProps {
  hasManifest: boolean;
  services: ServiceRow[];
}

export function ServicesTab({ hasManifest, services }: ServicesTabProps) {
  if (!hasManifest) {
    return <p className="text-xs text-[var(--muted-foreground)]">No lifecycle.json</p>;
  }

  if (services.length === 0) {
    return <p className="text-xs text-[var(--muted-foreground)]">No services defined</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {services.map((service) => {
        const icon = statusIcon[service.status] ?? "?";
        const color = statusColor[service.status] ?? "text-stone-400";

        return (
          <div
            key={service.id}
            className="rounded px-2 py-1.5 transition-colors hover:bg-[var(--surface-hover)]"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                <span className={`text-[11px] ${color}`}>{icon}</span>
                {service.service_name}
              </span>
              {service.effective_port && (
                <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                  :{service.effective_port}
                </span>
              )}
            </div>
            {service.status_reason && (
              <p className="mt-0.5 pl-5 text-[11px] text-red-400">{service.status_reason}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

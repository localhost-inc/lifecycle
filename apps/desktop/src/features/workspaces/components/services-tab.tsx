import { EmptyState, StatusDot, type StatusDotTone } from "@lifecycle/ui";
import { FileJson, Layers } from "lucide-react";
import type { ServiceRow } from "../api";

const statusTone: Record<string, StatusDotTone> = {
  stopped: "neutral",
  starting: "info",
  ready: "success",
  failed: "danger",
};

interface ServicesTabProps {
  hasManifest: boolean;
  services: ServiceRow[];
}

export function ServicesTab({ hasManifest, services }: ServicesTabProps) {
  if (!hasManifest) {
    return (
      <EmptyState
        description="Add a lifecycle.json to configure services."
        icon={<FileJson />}
        size="sm"
        title="No lifecycle.json"
      />
    );
  }

  if (services.length === 0) {
    return (
      <EmptyState
        description="Define services in lifecycle.json to see them here."
        icon={<Layers />}
        size="sm"
        title="No services defined"
      />
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {services.map((service) => {
        const tone = statusTone[service.status] ?? "neutral";
        const pulse = service.status === "starting";

        return (
          <div
            key={service.id}
            className="rounded px-2 py-1.5 transition-colors hover:bg-[var(--surface-hover)]"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                <StatusDot pulse={pulse} size="sm" tone={tone} />
                {service.service_name}
              </span>
              {service.effective_port && (
                <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                  :{service.effective_port}
                </span>
              )}
            </div>
            {service.status_reason && (
              <p className="mt-0.5 pl-5 text-[11px] text-[var(--destructive)]">
                {service.status_reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

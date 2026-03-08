import type { ServiceRow } from "../api";
import { ServicesTab } from "./services-tab";

const sectionHeader =
  "text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)] font-medium";

interface EnvironmentPanelProps {
  hasManifest: boolean;
  services: ServiceRow[];
}

export function EnvironmentPanel({ hasManifest, services }: EnvironmentPanelProps) {
  const readyCount = services.filter((service) => service.status === "ready").length;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center justify-between">
          <span className={sectionHeader}>Services</span>
          {services.length > 0 && (
            <span className="text-[10px] tracking-[0.18em] text-[var(--muted-foreground)]">
              {readyCount}/{services.length}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          <ServicesTab hasManifest={hasManifest} services={services} />
        </div>
      </div>
    </section>
  );
}

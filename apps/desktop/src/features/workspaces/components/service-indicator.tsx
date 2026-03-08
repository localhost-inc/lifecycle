import { Badge, Card, StatusDot, type StatusDotTone } from "@lifecycle/ui";
import type { ServiceRow } from "../api";

const statusTone: Record<string, StatusDotTone> = {
  stopped: "neutral",
  starting: "info",
  ready: "success",
  failed: "danger",
};

const statusVariant: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  stopped: "muted",
  starting: "info",
  ready: "success",
  failed: "destructive",
};

export function ServiceIndicator({ service }: { service: ServiceRow }) {
  const tone = statusTone[service.status] ?? "neutral";
  const variant = statusVariant[service.status] ?? "muted";
  const pulse = service.status === "starting";

  return (
    <Card className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <StatusDot pulse={pulse} tone={tone} />
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">{service.service_name}</p>
          {service.effective_port && (
            <p className="text-xs text-[var(--muted-foreground)]">:{service.effective_port}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {service.status_reason && (
          <span className="text-xs text-[var(--destructive)]">{service.status_reason}</span>
        )}
        <Badge variant={variant}>{service.status}</Badge>
      </div>
    </Card>
  );
}

import type { ServiceRecord } from "@lifecycle/contracts";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusDot,
  type StatusDotTone,
} from "@lifecycle/ui";
import { ExternalLink, FileJson, Layers } from "lucide-react";
import { useState } from "react";

const SERVICE_STATUS_TONES: Record<string, StatusDotTone> = {
  stopped: "neutral",
  starting: "info",
  ready: "success",
  failed: "danger",
};

function ServiceStatusBadge({ status }: { status: string }) {
  const isFailed = status === "failed";
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
        isFailed
          ? "border-[var(--destructive)]/40 text-[var(--destructive)]"
          : "border-[var(--border)] text-[var(--foreground)]/70"
      }`}
    >
      {status}
    </span>
  );
}

const exposureItems: Array<{ label: string; value: ServiceRecord["exposure"] }> = [
  { label: "Internal", value: "internal" },
  { label: "Local", value: "local" },
  { label: "Organization (Later)", value: "organization" },
];

interface ServicesTabProps {
  manifestState: "invalid" | "missing" | "valid";
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  services: ServiceRecord[];
}

interface ParsedPortDraft {
  error: string | null;
  value: number | null;
}

function parsePortDraft(value: string): ParsedPortDraft {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return { error: null, value: null };
  }

  if (!/^\d+$/.test(normalized)) {
    return { error: "Port override must be a whole number.", value: null };
  }

  const nextPort = Number.parseInt(normalized, 10);
  if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
    return { error: "Port override must be between 1 and 65535.", value: null };
  }

  return { error: null, value: nextPort };
}

function resolvePreviewUrl(service: ServiceRecord): string | null {
  if (service.preview_url) {
    return service.preview_url;
  }

  if (service.exposure !== "local" || service.effective_port === null) {
    return null;
  }

  return `http://localhost:${service.effective_port}`;
}

function previewLabelFor(service: ServiceRecord): string {
  if (service.exposure === "internal") {
    return "Internal only";
  }

  if (service.exposure === "organization") {
    return "Tunnel deferred";
  }

  if (service.effective_port === null) {
    return "No preview port";
  }

  switch (service.preview_status) {
    case "ready":
      return "Preview ready";
    case "provisioning":
      return "Preview provisioning";
    case "sleeping":
      return "Preview sleeping";
    case "failed":
      return "Preview failed";
    case "expired":
      return "Preview expired";
    default:
      return "Preview off";
  }
}

function ServiceRow({
  onUpdateService,
  service,
}: {
  onUpdateService: ServicesTabProps["onUpdateService"];
  service: ServiceRecord;
}) {
  const [draftExposure, setDraftExposure] = useState<ServiceRecord["exposure"]>(service.exposure);
  const [draftPort, setDraftPort] = useState(service.port_override?.toString() ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | null>(null);

  const parsedPort = parsePortDraft(draftPort);
  const previewUrl = resolvePreviewUrl(service);
  const isDirty = draftExposure !== service.exposure || parsedPort.value !== service.port_override;

  async function handleSave(): Promise<void> {
    if (isSaving || !isDirty || parsedPort.error) {
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      await onUpdateService({
        exposure: draftExposure,
        portOverride: parsedPort.value,
        serviceName: service.service_name,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset(): void {
    setDraftExposure(service.exposure);
    setDraftPort(service.port_override?.toString() ?? "");
    setSaveError(null);
    setCopyFeedback(null);
  }

  async function handleCopyPreview(): Promise<void> {
    if (!previewUrl || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopyFeedback("copied");
      setTimeout(() => setCopyFeedback(null), 1200);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleOpenPreview(): void {
    if (!previewUrl || service.preview_status !== "ready") {
      return;
    }

    openUrl(previewUrl);
  }

  const previewStatusLabel = previewLabelFor(service);
  const canOpenPreview = previewUrl !== null && service.preview_status === "ready";

  const [expanded, setExpanded] = useState(false);

  const showPreviewLine = service.preview_status !== "disabled" && service.exposure !== "internal";

  return (
    <div className="group/row">
      <button
        className="flex w-full items-start gap-3 px-2 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <StatusDot
          className="mt-1.5 shrink-0"
          pulse={service.status === "starting"}
          tone={SERVICE_STATUS_TONES[service.status] ?? "neutral"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--foreground)]">
              {service.service_name}
            </span>
            <ServiceStatusBadge status={service.status} />
            {canOpenPreview && (
              <ExternalLink
                className="size-3 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenPreview();
                }}
              />
            )}
          </div>
          {(showPreviewLine || service.effective_port !== null) && (
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]/45">
              {service.effective_port !== null && (
                <span>:{service.effective_port}</span>
              )}
              {showPreviewLine && service.effective_port !== null && <span> · </span>}
              {showPreviewLine && <span>{previewStatusLabel}</span>}
            </p>
          )}
        </div>
      </button>

      {service.status_reason && (
        <p className="px-2 pl-7 text-[11px] text-[var(--destructive)]">{service.status_reason}</p>
      )}

      {expanded && (
        <div className="flex flex-col gap-2 px-2 pb-2 pl-7 pt-1">
          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Exposure
              </span>
              <Select
                items={exposureItems}
                value={draftExposure}
                onValueChange={(value: ServiceRecord["exposure"]) => setDraftExposure(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select exposure" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="organization">Organization (Later)</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="flex w-24 flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Port
              </span>
              <Input
                inputMode="numeric"
                onChange={(event) => setDraftPort(event.target.value)}
                placeholder={service.default_port?.toString() ?? "default"}
                type="number"
                value={draftPort}
              />
            </label>

            <div className="flex items-center gap-1">
              <Button
                disabled={!isDirty || Boolean(parsedPort.error) || isSaving}
                onClick={() => void handleSave()}
                size="sm"
                variant="outline"
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                disabled={!isDirty || isSaving}
                onClick={handleReset}
                size="sm"
                variant="ghost"
              >
                Reset
              </Button>
            </div>
          </div>

          {previewUrl && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--muted-foreground)] truncate">
                {previewUrl}
              </span>
              <Button
                disabled={!canOpenPreview}
                onClick={handleOpenPreview}
                size="sm"
                variant="ghost"
              >
                Open
              </Button>
              <Button onClick={() => void handleCopyPreview()} size="sm" variant="ghost">
                {copyFeedback === "copied" ? "Copied" : "Copy"}
              </Button>
            </div>
          )}

          {draftExposure === "organization" && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Organization tunnel routing is deferred. Use `local` exposure for localhost previews
              today.
            </p>
          )}
          {service.preview_failure_reason && (
            <p className="text-[11px] text-[var(--destructive)]">
              Preview failure: {service.preview_failure_reason}
            </p>
          )}
          {parsedPort.error && (
            <p className="text-[11px] text-[var(--destructive)]">{parsedPort.error}</p>
          )}
          {saveError && <p className="text-[11px] text-[var(--destructive)]">{saveError}</p>}
        </div>
      )}
    </div>
  );
}

export function ServicesTab({ manifestState, onUpdateService, services }: ServicesTabProps) {
  if (services.length > 0) {
    return (
      <div className="flex flex-col divide-y divide-[var(--border)]/40">
        {services.map((service) => (
          <ServiceRow
            key={`${service.id}:${service.updated_at}`}
            onUpdateService={onUpdateService}
            service={service}
          />
        ))}
      </div>
    );
  }

  if (manifestState === "missing") {
    return (
      <EmptyState
        description="Add a lifecycle.json to configure services."
        icon={<FileJson />}
        size="sm"
        title="No lifecycle.json"
      />
    );
  }

  if (manifestState === "invalid") {
    return (
      <EmptyState
        description="Fix lifecycle.json to register services for this workspace."
        icon={<FileJson />}
        size="sm"
        title="Invalid lifecycle.json"
      />
    );
  }

  return (
    <EmptyState
      description="Define services in lifecycle.json to see them here."
      icon={<Layers />}
      size="sm"
      title="No services defined"
    />
  );
}

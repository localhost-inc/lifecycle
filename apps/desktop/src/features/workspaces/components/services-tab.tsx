import type { ServiceRecord } from "@lifecycle/contracts";
import {
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  Spinner,
  SelectTrigger,
  SelectValue,
} from "@lifecycle/ui";
import {
  AlertTriangle,
  Check,
  Circle,
  ExternalLink,
  FileJson,
  Layers,
  RotateCcw,
  Settings,
} from "lucide-react";
import { useState, type ReactNode } from "react";

const statusIcon: Record<string, { icon: ReactNode; className: string }> = {
  stopped: {
    icon: <Circle className="size-4" />,
    className: "text-[var(--muted-foreground)]",
  },
  starting: {
    icon: <Spinner className="size-4" />,
    className: "text-blue-400",
  },
  ready: {
    icon: <Check className="size-4" strokeWidth={2.5} />,
    className: "text-emerald-400",
  },
  failed: {
    icon: <AlertTriangle className="size-4" />,
    className: "text-red-400",
  },
};

const defaultStatusIcon = statusIcon.stopped!;

function ServiceActionIcon({ service, onOpen }: { service: ServiceRecord; onOpen: () => void }) {
  if (service.status === "ready" && service.preview_status === "ready") {
    return (
      <button
        className="flex h-6 w-6 items-center justify-center rounded text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        title="Open preview"
        type="button"
      >
        <ExternalLink className="size-3.5" />
      </button>
    );
  }

  if (service.status === "failed") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center text-[var(--muted-foreground)]"
        title="Retry by restarting the environment"
      >
        <RotateCcw className="size-3.5" />
      </span>
    );
  }

  return (
    <button
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-[var(--foreground)]"
      onClick={(e) => {
        e.stopPropagation();
      }}
      title="Service settings"
      type="button"
    >
      <Settings className="size-3.5" />
    </button>
  );
}

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
  const { icon: leftIcon, className: iconClassName } =
    statusIcon[service.status] ?? defaultStatusIcon;
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
    if (
      !previewUrl ||
      service.preview_status !== "ready" ||
      typeof window === "undefined" ||
      typeof window.open !== "function"
    ) {
      return;
    }

    window.open(previewUrl, "_blank", "noopener,noreferrer");
  }

  const previewStatusLabel = previewLabelFor(service);
  const canOpenPreview = previewUrl !== null && service.preview_status === "ready";

  const [expanded, setExpanded] = useState(false);

  const showPreviewLine =
    service.preview_status !== "disabled" && service.exposure !== "internal";

  return (
    <div className="group/row">
      <div
        role="button"
        tabIndex={0}
        className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span className={`flex shrink-0 items-center justify-center ${iconClassName}`}>
          {leftIcon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--foreground)]">
              {service.service_name}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-[var(--muted-foreground)]">
              {service.status}
            </span>
          </div>
          {(showPreviewLine || service.effective_port !== null) && (
            <div className="flex items-baseline gap-1.5 text-[11px] text-[var(--muted-foreground)]">
              {service.effective_port !== null && (
                <span className="font-mono">:{service.effective_port}</span>
              )}
              {showPreviewLine && service.effective_port !== null && <span>·</span>}
              {showPreviewLine && <span>{previewStatusLabel}</span>}
            </div>
          )}
        </div>
        <ServiceActionIcon service={service} onOpen={handleOpenPreview} />
      </div>

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
      <div className="flex flex-col gap-0.5">
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

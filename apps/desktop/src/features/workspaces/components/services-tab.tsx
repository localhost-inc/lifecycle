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
  SetupProgress,
} from "@lifecycle/ui";
import { ExternalLink, FileJson, Layers, Loader2, TerminalSquare } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { EnvironmentSection } from "./environment-section";
import type { EnvironmentTaskState } from "../hooks";

type ServiceRuntime = "image" | "process";

interface StatusStyles {
  dotClassName: string;
  dotStyle?: CSSProperties;
  nameClassName: string;
  portClassName: string;
  rowStyle: CSSProperties;
}

const STATUS_STYLES: Record<string, StatusStyles> = {
  stopped: {
    dotClassName: "bg-slate-500/30",
    nameClassName: "text-[var(--foreground)]/30",
    portClassName: "text-slate-500/20",
    rowStyle: {},
  },
  starting: {
    dotClassName: "",
    nameClassName: "text-[var(--foreground)]",
    portClassName: "text-blue-500/45",
    rowStyle: {
      backgroundImage:
        "linear-gradient(90deg, rgba(59, 130, 246, 0.07) 0%, rgba(59, 130, 246, 0.01) 100%)",
    },
  },
  ready: {
    dotClassName: "bg-emerald-500",
    dotStyle: { boxShadow: "0 0 6px rgba(16, 185, 129, 0.5)" },
    nameClassName: "text-[var(--foreground)]",
    portClassName: "text-emerald-500/50",
    rowStyle: {
      backgroundImage:
        "linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)",
    },
  },
  failed: {
    dotClassName: "bg-red-500",
    dotStyle: { boxShadow: "0 0 6px rgba(239, 68, 68, 0.4)" },
    nameClassName: "text-[var(--foreground)]",
    portClassName: "text-red-500/40",
    rowStyle: {
      backgroundImage:
        "linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.02) 100%)",
    },
  },
};

const exposureItems: Array<{ label: string; value: ServiceRecord["exposure"] }> = [
  { label: "Internal", value: "internal" },
  { label: "Local", value: "local" },
  { label: "Organization (Later)", value: "organization" },
];

const STATUS_REASON_LABELS: Partial<Record<NonNullable<ServiceRecord["status_reason"]>, string>> = {
  service_start_failed: "Failed to start",
  service_process_exited: "Process exited before ready",
  service_dependency_failed: "Dependency failed",
  service_port_unreachable: "Port unreachable",
  unknown: "Failed to start",
};

interface ServicesTabProps {
  declaredTaskCount: number;
  declaredServiceCount: number;
  environmentTasks: EnvironmentTaskState[];
  manifestState: "invalid" | "missing" | "valid";
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  serviceRuntimeByName: Partial<Record<string, ServiceRuntime>>;
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

function formatStatusReason(reason: ServiceRecord["status_reason"]): string | null {
  if (!reason) {
    return null;
  }

  return STATUS_REASON_LABELS[reason] ?? reason;
}

export function ServiceRow({
  onUpdateService,
  runtime,
  service,
}: {
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  runtime: "image" | "process" | null;
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
  const statusReasonLabel = formatStatusReason(service.status_reason);

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

  const canOpenPreview = previewUrl !== null && service.preview_status === "ready";
  const [expanded, setExpanded] = useState(false);
  // biome-ignore lint: indexing a known-populated record
  const styles = (STATUS_STYLES[service.status] ?? STATUS_STYLES.stopped)!;
  const runtimeIcon =
    runtime === "image" ? (
      <Layers className="size-3 text-[var(--muted-foreground)]/70" strokeWidth={2.2} />
    ) : runtime === "process" ? (
      <TerminalSquare className="size-3 text-[var(--muted-foreground)]/70" strokeWidth={2.2} />
    ) : null;

  return (
    <div className="group/row">
      <button
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        style={styles.rowStyle}
        type="button"
      >
        <div className="flex size-3.5 shrink-0 items-center justify-center">
          {service.status === "starting" ? (
            <Loader2 className="size-3.5 animate-spin text-blue-500" strokeWidth={2.5} />
          ) : (
            <span
              className={`inline-block size-[7px] rounded-full ${styles.dotClassName}`}
              style={styles.dotStyle}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {runtimeIcon}
              <span
                className={`truncate text-[13px] font-medium ${styles.nameClassName}`}
              >
                {service.service_name}
              </span>
            </span>
            {service.effective_port !== null && (
              <span className={`shrink-0 font-mono text-[11px] ${styles.portClassName}`}>
                :{service.effective_port}
              </span>
            )}
          </div>
          {statusReasonLabel && (
            <p className="mt-1 text-[10px] text-red-500/55">{statusReasonLabel}</p>
          )}
        </div>
        {canOpenPreview && (
          <ExternalLink
            className="size-3.5 shrink-0 text-[var(--muted-foreground)]/40 transition-colors hover:text-[var(--foreground)]"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPreview();
            }}
          />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 px-3 pb-3 pl-[38px] pt-1">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
            <label className="flex min-w-0 flex-col gap-1">
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

            <label className="flex min-w-0 flex-col gap-1">
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

            <div className="flex flex-wrap items-center gap-1 sm:justify-end">
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

export function ServicesTab({
  declaredTaskCount,
  declaredServiceCount,
  environmentTasks,
  manifestState,
  onUpdateService,
  serviceRuntimeByName,
  services,
}: ServicesTabProps) {
  const imageServices = services.filter(
    (service) => serviceRuntimeByName[service.service_name] === "image",
  );
  const processServices = services.filter(
    (service) => serviceRuntimeByName[service.service_name] === "process",
  );
  const untypedServices = services.filter(
    (service) => serviceRuntimeByName[service.service_name] === undefined,
  );

  function renderServiceGroup(title: string, runtime: ServiceRuntime | null, group: ServiceRecord[]) {
    if (group.length === 0) {
      return null;
    }

    const icon =
      runtime === "image" ? (
        <Layers className="size-3.5" strokeWidth={2.2} />
      ) : runtime === "process" ? (
        <TerminalSquare className="size-3.5" strokeWidth={2.2} />
      ) : undefined;

    return (
      <EnvironmentSection icon={icon} title={title}>
        <div className="flex flex-col gap-1">
          {group.map((service) => (
            <ServiceRow
              key={`${service.id}:${service.updated_at}`}
              onUpdateService={onUpdateService}
              runtime={runtime}
              service={service}
            />
          ))}
        </div>
      </EnvironmentSection>
    );
  }

  if (services.length > 0 || environmentTasks.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {environmentTasks.length > 0 ? (
          <EnvironmentSection icon={<Loader2 className="size-3.5" strokeWidth={2.2} />} title="Environment tasks">
            <SetupProgress expandOutputByDefault steps={environmentTasks} />
          </EnvironmentSection>
        ) : null}
        {services.length > 0 ? (
          <EnvironmentSection icon={<Layers className="size-3.5" strokeWidth={2.2} />} title="Services">
            <div className="flex flex-col gap-4">
              {renderServiceGroup("Image services", "image", imageServices)}
              {renderServiceGroup("Process services", "process", processServices)}
              {renderServiceGroup("Services", null, untypedServices)}
            </div>
          </EnvironmentSection>
        ) : null}
      </div>
    );
  }

  if (manifestState === "missing") {
    return (
      <EmptyState
        description="Add a lifecycle.json to configure this workspace environment."
        icon={<FileJson />}
        size="sm"
        title="No lifecycle.json"
      />
    );
  }

  if (manifestState === "invalid") {
    return (
      <EmptyState
        description="Fix lifecycle.json to register environment nodes for this workspace."
        icon={<FileJson />}
        size="sm"
        title="Invalid lifecycle.json"
      />
    );
  }

  if (declaredServiceCount > 0) {
    return (
      <EmptyState
        description="Lifecycle is reconciling environment nodes declared in lifecycle.json for this workspace."
        icon={<Layers />}
        size="sm"
        title="Loading environment"
      />
    );
  }

  if (declaredTaskCount > 0) {
    return (
      <EmptyState
        description="Environment task output appears here while this workspace starts."
        icon={<Layers />}
        size="sm"
        title="No active environment tasks"
      />
    );
  }

  return (
    <EmptyState
      description="Declare task or service nodes under environment in lifecycle.json to see them here."
      icon={<Layers />}
      size="sm"
      title="No environment nodes declared"
    />
  );
}

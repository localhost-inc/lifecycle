import type { ServiceRecord } from "@lifecycle/contracts";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SetupProgress,
  Spinner,
} from "@lifecycle/ui";
import { ChevronRight, ExternalLink, FileJson, Layers, Play, TerminalSquare } from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import { hasAnsiCodes, renderAnsiLine } from "../../../lib/ansi";
import { EnvironmentSection } from "./environment-section";
import type { EnvironmentTaskState, ServiceLogLine } from "../hooks";
import { formatWorkspaceError } from "../lib/workspace-errors";

type ServiceRuntime = "image" | "process";

interface StatusStyles {
  dotStyle: CSSProperties;
  nameClassName: string;
  rowStyle: CSSProperties;
}

type ServiceRowStatusAffordance = "full" | "indicator";

const STATUS_STYLES: Record<string, StatusStyles> = {
  stopped: {
    dotStyle: {
      backgroundColor: "var(--status-neutral)",
    },
    nameClassName: "text-[var(--foreground)]",
    rowStyle: {},
  },
  starting: {
    dotStyle: {
      backgroundColor: "var(--status-info)",
    },
    nameClassName: "text-[var(--foreground)]",
    rowStyle: {
      backgroundImage:
        "linear-gradient(90deg, color-mix(in srgb, var(--status-info) 7%, transparent) 0%, color-mix(in srgb, var(--status-info) 1%, transparent) 100%)",
    },
  },
  ready: {
    dotStyle: {
      backgroundColor: "var(--status-success)",
      boxShadow: "0 0 6px color-mix(in srgb, var(--status-success) 50%, transparent)",
    },
    nameClassName: "text-[var(--foreground)]",
    rowStyle: {
      backgroundImage:
        "linear-gradient(90deg, color-mix(in srgb, var(--status-success) 8%, transparent) 0%, color-mix(in srgb, var(--status-success) 2%, transparent) 100%)",
    },
  },
  failed: {
    dotStyle: {
      backgroundColor: "var(--status-danger)",
      boxShadow: "0 0 6px color-mix(in srgb, var(--status-danger) 40%, transparent)",
    },
    nameClassName: "text-[var(--foreground)]",
    rowStyle: {
      backgroundImage:
        "linear-gradient(90deg, color-mix(in srgb, var(--status-danger) 8%, transparent) 0%, color-mix(in srgb, var(--status-danger) 2%, transparent) 100%)",
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

export function resolvePreviewUrl(service: ServiceRecord): string | null {
  return service.preview_url;
}

export function formatServiceStatusReason(reason: ServiceRecord["status_reason"]): string | null {
  if (!reason) {
    return null;
  }

  return STATUS_REASON_LABELS[reason] ?? reason;
}

function renderLogLine(line: ServiceLogLine, index: number): ReactNode {
  const content = hasAnsiCodes(line.text)
    ? renderAnsiLine(line.text, `l${index}`)
    : line.text;

  return <span key={index}>{content}</span>;
}

function ServiceLogBody({ height, lines }: { height: number | null; lines: ServiceLogLine[] }) {
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const wasAtBottomRef = useRef(true);

  const renderedContent = useMemo(() => {
    const result: ReactNode[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        result.push("\n");
      }
      result.push(renderLogLine(lines[i]!, i));
    }
    return result;
  }, [lines]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !wasAtBottomRef.current) {
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  if (lines.length === 0) {
    return null;
  }

  return (
    <pre
      ref={scrollRef}
      className="overflow-auto whitespace-pre-wrap bg-[var(--background)] px-3 py-2 font-mono text-xs text-[var(--muted-foreground)]"
      onScroll={handleScroll}
      style={height !== null ? { height } : undefined}
    >
      {renderedContent}
    </pre>
  );
}

function useResizeHandle(minHeight = 60) {
  const [height, setHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const measured = containerRef.current?.offsetHeight ?? 160;
      dragState.current = { startY: e.clientY, startHeight: measured };
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return;
      const next = Math.max(minHeight, dragState.current.startHeight + (e.clientY - dragState.current.startY));
      if (containerRef.current) {
        containerRef.current.style.height = `${next}px`;
      }
    },
    [minHeight],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return;
      const next = Math.max(minHeight, dragState.current.startHeight + (e.clientY - dragState.current.startY));
      dragState.current = null;
      setHeight(next);
    },
    [minHeight],
  );

  return { containerRef, handleProps: { onPointerDown, onPointerMove, onPointerUp }, height };
}

export function ServiceRow({
  expanded: expandedProp,
  logLines,
  onOpenLogs: _onOpenLogs,
  onStartService,
  onToggleExpanded,
  onUpdateService,
  runDisabled = false,
  runPending = false,
  runtime,
  service,
  statusAffordance: _statusAffordance = "full",
}: {
  expanded?: boolean;
  logLines?: ServiceLogLine[];
  onOpenLogs?: (serviceName: string) => void;
  onStartService?: (serviceName: string) => void;
  onToggleExpanded?: () => void;
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  runDisabled?: boolean;
  runPending?: boolean;
  runtime: "image" | "process" | null;
  service: ServiceRecord;
  statusAffordance?: ServiceRowStatusAffordance;
}) {
  const [draftExposure, setDraftExposure] = useState<ServiceRecord["exposure"]>(service.exposure);
  const [draftPort, setDraftPort] = useState(service.port_override?.toString() ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | null>(null);
  const { containerRef: logContainerRef, handleProps: resizeHandleProps, height: logHeight } = useResizeHandle();

  const parsedPort = parsePortDraft(draftPort);
  const previewUrl = resolvePreviewUrl(service);
  const isDirty = draftExposure !== service.exposure || parsedPort.value !== service.port_override;
  const statusReasonLabel = formatServiceStatusReason(service.status_reason);

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
      setSaveError(formatWorkspaceError(error, "Failed to update service settings."));
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
  const hasLogs = logLines !== undefined && logLines.length > 0;
  const isExpandable = onToggleExpanded !== undefined;
  const expanded = expandedProp ?? false;
  const canStartService =
    onStartService !== undefined && (service.status === "stopped" || service.status === "failed");
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
      <div
        className={`flex items-center gap-2 bg-[var(--surface)] px-3 py-1.5 border-b border-[var(--border)]${isExpandable ? " cursor-pointer" : ""}`}
        onClick={isExpandable ? onToggleExpanded : undefined}
      >
        <div className="flex size-3.5 shrink-0 items-center justify-center">
          {service.status === "starting" ? (
            <Spinner className="size-3.5 text-[var(--status-info)]" />
          ) : (
            <span className="inline-block size-[7px] rounded-full" style={styles.dotStyle} />
          )}
        </div>
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
          {runtimeIcon}
          <span className={`truncate text-[13px] font-medium ${styles.nameClassName}`}>
            {service.service_name}
          </span>
          {statusReasonLabel && (
            <span className="text-[10px]" style={{ color: "var(--status-danger)" }}>
              {statusReasonLabel}
            </span>
          )}
        </span>
        {canOpenPreview && (
          <button
            aria-label={`Open preview for ${service.service_name}`}
            className="rounded-md p-1 text-[var(--muted-foreground)]/40 transition-colors hover:text-[var(--foreground)] cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPreview();
            }}
            type="button"
          >
            <ExternalLink className="size-3.5" />
          </button>
        )}
        {canStartService && (
          <IconButton
            aria-label={`Run ${service.service_name} and its dependencies`}
            disabled={runDisabled}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onStartService?.(service.service_name);
            }}
            title={`Run ${service.service_name} and its dependencies`}
          >
            {runPending ? (
              <Spinner className="size-3.5" />
            ) : (
              <Play className="size-3.5 fill-current" strokeWidth={2.4} />
            )}
          </IconButton>
        )}
        {hasLogs && (
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]/60">
            {logLines!.length}
          </span>
        )}
        {isExpandable && (
          <ChevronRight
            className={`size-3 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            strokeWidth={2.4}
          />
        )}
      </div>

      {isExpandable && (
        <div
          className="grid transition-[grid-template-rows] duration-150 ease-out"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div ref={logContainerRef} style={logHeight !== null ? { height: logHeight } : undefined}>
              {hasLogs
                ? <ServiceLogBody height={logHeight} lines={logLines!} />
                : <div className="bg-[var(--background)] px-3 py-3 text-xs text-[var(--muted-foreground)]/60">No output yet</div>
              }
            </div>
            {/* biome-ignore lint: resize handle */}
            <div
              className="h-1.5 cursor-row-resize border-b border-[var(--border)] bg-[var(--surface)] transition-colors hover:bg-[var(--muted-foreground)]/15 active:bg-[var(--muted-foreground)]/25"
              {...resizeHandleProps}
            />
          </div>
        </div>
      )}

      {expanded && !isExpandable && (
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
                Port override
              </span>
              <Input
                inputMode="numeric"
                onChange={(event) => setDraftPort(event.target.value)}
                placeholder={service.assigned_port?.toString() ?? "auto"}
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

  function renderServiceGroup(
    title: string,
    runtime: ServiceRuntime | null,
    group: ServiceRecord[],
  ) {
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
          <EnvironmentSection
            icon={<Spinner className="size-3.5" />}
            title="Environment tasks"
          >
            <SetupProgress expandOutputByDefault steps={environmentTasks} />
          </EnvironmentSection>
        ) : null}
        {services.length > 0 ? (
          <EnvironmentSection
            icon={<Layers className="size-3.5" strokeWidth={2.2} />}
            title="Services"
          >
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

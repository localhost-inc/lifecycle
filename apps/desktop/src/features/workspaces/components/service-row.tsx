import type { ServiceRecord } from "@lifecycle/contracts";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IconButton, Spinner } from "@lifecycle/ui";
import { ChevronRight, ExternalLink, Layers, Play, TerminalSquare } from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { hasAnsiCodes, renderAnsiLine } from "@/lib/ansi";
import type { ServiceLogLine } from "@/features/workspaces/api";

type ServiceRuntime = "image" | "process";

interface StatusStyles {
  dotStyle: CSSProperties;
  nameClassName: string;
}

const STATUS_STYLES: Record<string, StatusStyles> = {
  stopped: {
    dotStyle: {
      backgroundColor: "var(--status-neutral)",
    },
    nameClassName: "text-[var(--foreground)]",
  },
  starting: {
    dotStyle: {
      backgroundColor: "var(--status-info)",
    },
    nameClassName: "text-[var(--foreground)]",
  },
  ready: {
    dotStyle: {
      backgroundColor: "var(--status-success)",
      boxShadow: "0 0 6px color-mix(in srgb, var(--status-success) 50%, transparent)",
    },
    nameClassName: "text-[var(--foreground)]",
  },
  failed: {
    dotStyle: {
      backgroundColor: "var(--status-danger)",
      boxShadow: "0 0 6px color-mix(in srgb, var(--status-danger) 40%, transparent)",
    },
    nameClassName: "text-[var(--foreground)]",
  },
};

const STATUS_REASON_LABELS: Partial<Record<NonNullable<ServiceRecord["status_reason"]>, string>> = {
  service_start_failed: "Failed to start",
  service_process_exited: "Process exited before ready",
  service_dependency_failed: "Dependency failed",
  service_port_unreachable: "Port unreachable",
  unknown: "Failed to start",
};

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
  const content = hasAnsiCodes(line.text) ? renderAnsiLine(line.text, `l${index}`) : line.text;

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
  const dragState = useRef<{ startHeight: number; startY: number } | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const measured = containerRef.current?.offsetHeight ?? 160;
    dragState.current = { startHeight: measured, startY: event.clientY };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragState.current) {
        return;
      }
      const next = Math.max(
        minHeight,
        dragState.current.startHeight + (event.clientY - dragState.current.startY),
      );
      if (containerRef.current) {
        containerRef.current.style.height = `${next}px`;
      }
    },
    [minHeight],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragState.current) {
        return;
      }
      const next = Math.max(
        minHeight,
        dragState.current.startHeight + (event.clientY - dragState.current.startY),
      );
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
  onStartService,
  onToggleExpanded,
  runDisabled = false,
  runPending = false,
  runtime,
  service,
}: {
  expanded?: boolean;
  logLines?: ServiceLogLine[];
  onStartService?: (serviceName: string) => void;
  onToggleExpanded?: () => void;
  runDisabled?: boolean;
  runPending?: boolean;
  runtime: ServiceRuntime | null;
  service: ServiceRecord;
}) {
  const {
    containerRef: logContainerRef,
    handleProps: resizeHandleProps,
    height: logHeight,
  } = useResizeHandle();
  const previewUrl = resolvePreviewUrl(service);
  const statusReasonLabel = formatServiceStatusReason(service.status_reason);
  const canOpenPreview = previewUrl !== null && service.status === "ready" && service.assigned_port !== null;
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

  function handleOpenPreview(): void {
    if (!previewUrl || !canOpenPreview) {
      return;
    }

    openUrl(previewUrl);
  }

  return (
    <div className="group/row">
      <div
        className={`flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5${isExpandable ? " cursor-pointer" : ""}`}
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
            {service.name}
          </span>
          {statusReasonLabel && (
            <span className="text-[10px]" style={{ color: "var(--status-danger)" }}>
              {statusReasonLabel}
            </span>
          )}
        </span>
        {canOpenPreview && (
          <button
            aria-label={`Open preview for ${service.name}`}
            className="cursor-pointer rounded-md p-1 text-[var(--muted-foreground)]/40 transition-colors hover:text-[var(--foreground)]"
            onClick={(event) => {
              event.stopPropagation();
              handleOpenPreview();
            }}
            type="button"
          >
            <ExternalLink className="size-3.5" />
          </button>
        )}
        {canStartService && (
          <IconButton
            aria-label={`Run ${service.name} and its dependencies`}
            disabled={runDisabled}
            onClick={(event: ReactMouseEvent) => {
              event.stopPropagation();
              onStartService?.(service.name);
            }}
            title={`Run ${service.name} and its dependencies`}
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
            {logLines.length}
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
            <div
              ref={logContainerRef}
              style={logHeight !== null ? { height: logHeight } : undefined}
            >
              {hasLogs ? (
                <ServiceLogBody height={logHeight} lines={logLines} />
              ) : (
                <div className="bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted-foreground)]/60">
                  No output yet
                </div>
              )}
            </div>
            {hasLogs && (
              // biome-ignore lint: resize handle
              <div
                className="h-1.5 cursor-row-resize border-b border-[var(--border)] bg-[var(--surface)] transition-colors hover:bg-[var(--muted-foreground)]/15 active:bg-[var(--muted-foreground)]/25"
                {...resizeHandleProps}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

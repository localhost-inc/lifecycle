import type { LifecycleConfig, WorkspaceRecord } from "@lifecycle/contracts";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasAnsiCodes, renderAnsiLine } from "../../../lib/ansi";
import type {
  EnvironmentTaskState,
  ServiceLogLine,
  ServiceLogState,
  SetupStepState,
} from "../hooks";
import { deriveBootSequenceItems, type BootSequenceItem } from "./boot-sequence";

interface BootLogEntry {
  id: string;
  kind: "setup" | "task";
  name: string;
  output: string[];
  status: SetupStepState["status"];
}

export interface LogsTabProps {
  config: LifecycleConfig | null;
  declaredStepNames: string[];
  environmentTasks: EnvironmentTaskState[];
  selectedServiceName?: string | null;
  serviceLogs?: ServiceLogState[];
  serviceRuntimeByName: Partial<Record<string, "image" | "process">>;
  setupSteps: SetupStepState[];
  workspace: Pick<WorkspaceRecord, "failure_reason" | "status" | "setup_completed_at">;
}

export function collectEnvironmentAncestors(
  config: LifecycleConfig,
  nodeName: string,
  visited = new Set<string>(),
): Set<string> {
  if (visited.has(nodeName)) {
    return visited;
  }

  visited.add(nodeName);
  const node = config.environment[nodeName];
  if (!node) {
    return visited;
  }

  for (const dependency of node.depends_on ?? []) {
    collectEnvironmentAncestors(config, dependency, visited);
  }

  return visited;
}

export function deriveBootLogEntries(
  config: LifecycleConfig | null,
  items: BootSequenceItem[],
  selectedServiceName: string | null | undefined,
): BootLogEntry[] {
  const visibleEnvironmentNodes =
    selectedServiceName === null || selectedServiceName === undefined || config === null
      ? null
      : collectEnvironmentAncestors(config, selectedServiceName);

  return items.flatMap((item) => {
    if (item.kind === "service") {
      return [];
    }

    if (item.output.length === 0) {
      return [];
    }

    if (item.kind === "task" && visibleEnvironmentNodes !== null) {
      if (!visibleEnvironmentNodes.has(item.name)) {
        return [];
      }
    }

    return [
      {
        id: item.id,
        kind: item.kind,
        name: item.name,
        output: item.output,
        status: item.status,
      },
    ];
  });
}

function formatStatusLabel(status: BootLogEntry["status"]): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    case "timeout":
      return "Timed out";
    case "pending":
      return "Pending";
  }
}

function renderServiceLogLine(line: ServiceLogLine, index: number): ReactNode {
  const content = hasAnsiCodes(line.text)
    ? renderAnsiLine(line.text, `l${index}`)
    : line.text;

  return <span key={index}>{content}</span>;
}

function renderServiceLogLines(lines: ServiceLogLine[]): ReactNode[] {
  const result: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      result.push("\n");
    }
    result.push(renderServiceLogLine(lines[i]!, i));
  }
  return result;
}

function BootLogSection({ entry }: { entry: BootLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const renderedContent = useMemo(() => {
    const result: ReactNode[] = [];
    for (let i = 0; i < entry.output.length; i++) {
      if (i > 0) {
        result.push("\n");
      }
      const line = entry.output[i]!;
      result.push(hasAnsiCodes(line) ? renderAnsiLine(line, `l${i}`) : line);
    }
    return result;
  }, [entry.output]);

  return (
    <section>
      <button
        className="flex w-full cursor-pointer items-center gap-2 bg-[var(--surface)] px-3 py-2 text-left border-b border-[var(--border)]"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[var(--foreground)]">
            {entry.name}
          </div>
        </div>
        <div className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
          {entry.kind === "setup" ? "Setup" : "Task"}
        </div>
        <div className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
          {formatStatusLabel(entry.status)}
        </div>
      </button>
      {expanded && (
        <pre className="overflow-auto whitespace-pre-wrap bg-[var(--background)] px-3 py-2 font-mono text-xs text-[var(--muted-foreground)]">
          {renderedContent}
        </pre>
      )}
    </section>
  );
}

function ServiceLogSection({ log }: { log: ServiceLogState }) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const wasAtBottomRef = useRef(true);

  const renderedContent = useMemo(() => renderServiceLogLines(log.lines), [log.lines]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !wasAtBottomRef.current) {
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [log.lines.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  if (log.lines.length === 0) {
    return null;
  }

  return (
    <section>
      <button
        className="flex w-full cursor-pointer items-center gap-2 bg-[var(--surface)] px-3 py-2 text-left border-b border-[var(--border)]"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[var(--foreground)]">
            {log.serviceName}
          </div>
        </div>
        <div className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">
          {log.lines.length} {log.lines.length === 1 ? "line" : "lines"}
        </div>
      </button>
      {expanded && (
        <pre
          ref={scrollRef}
          className="overflow-auto whitespace-pre-wrap bg-[var(--background)] px-3 py-2 font-mono text-xs text-[var(--muted-foreground)]"
          onScroll={handleScroll}
        >
          {renderedContent}
        </pre>
      )}
    </section>
  );
}

export function LogsTab({
  config,
  declaredStepNames,
  environmentTasks,
  selectedServiceName,
  serviceLogs = [],
  serviceRuntimeByName,
  setupSteps,
  workspace,
}: LogsTabProps) {
  const items = deriveBootSequenceItems(
    config,
    declaredStepNames,
    setupSteps,
    environmentTasks,
    [],
    serviceRuntimeByName,
    workspace.setup_completed_at !== null && workspace.setup_completed_at !== undefined,
  );
  const logEntries = deriveBootLogEntries(config, items, selectedServiceName);

  const filteredServiceLogs =
    selectedServiceName === null || selectedServiceName === undefined
      ? serviceLogs
      : serviceLogs.filter((log) => log.serviceName === selectedServiceName);

  const hasContent = logEntries.length > 0 || filteredServiceLogs.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="-mx-3 flex flex-col">
      {logEntries.map((entry) => (
        <BootLogSection entry={entry} key={entry.id} />
      ))}
      {filteredServiceLogs.map((log) => (
        <ServiceLogSection key={log.serviceName} log={log} />
      ))}
    </div>
  );
}

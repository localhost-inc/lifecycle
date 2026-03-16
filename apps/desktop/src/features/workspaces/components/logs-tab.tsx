import type { LifecycleConfig, WorkspaceRecord } from "@lifecycle/contracts";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";
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
  serviceRuntimeByName: Partial<Record<string, "image" | "process">>;
  setupSteps: SetupStepState[];
  workspace: Pick<WorkspaceRecord, "failure_reason" | "status" | "setup_completed_at">;
}

function collectEnvironmentAncestors(
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

export function LogsTab({
  config,
  declaredStepNames,
  environmentTasks,
  selectedServiceName,
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

  if (logEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {logEntries.map((entry) => (
        <section
          className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/45"
          key={entry.id}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-[var(--foreground)]">
                {entry.name}
              </div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                {entry.kind === "setup" ? "Setup" : "Task"}
              </div>
            </div>
            <div className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
              {formatStatusLabel(entry.status)}
            </div>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs text-[var(--muted-foreground)]">
            {entry.output.join("\n")}
          </pre>
        </section>
      ))}
    </div>
  );
}

import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { Button, EmptyState } from "@lifecycle/ui";
import { ScrollText } from "lucide-react";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";
import { deriveBootSequenceItems, type BootSequenceItem } from "./boot-sequence";
import { formatServiceStatusReason, resolvePreviewUrl } from "./services-tab";

interface BootLogEntry {
  id: string;
  kind: "setup" | "task";
  name: string;
  output: string[];
  status: SetupStepState["status"];
}

interface LogsTabProps {
  config: LifecycleConfig | null;
  declaredStepNames: string[];
  environmentTasks: EnvironmentTaskState[];
  onClearSelectedService?: (() => void) | undefined;
  selectedServiceName?: string | null;
  serviceRuntimeByName: Partial<Record<string, "image" | "process">>;
  services: ServiceRecord[];
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

function scopeDescription(selectedServiceName: string | null | undefined): string {
  if (!selectedServiceName) {
    return "Setup and environment-task output captured for this workspace boot.";
  }

  return `Showing setup output and dependency task output filtered to ${selectedServiceName}.`;
}

export function LogsTab({
  config,
  declaredStepNames,
  environmentTasks,
  onClearSelectedService,
  selectedServiceName,
  serviceRuntimeByName,
  services,
  setupSteps,
  workspace,
}: LogsTabProps) {
  const items = deriveBootSequenceItems(
    config,
    declaredStepNames,
    setupSteps,
    environmentTasks,
    services,
    serviceRuntimeByName,
    workspace.setup_completed_at !== null && workspace.setup_completed_at !== undefined,
  );
  const logEntries = deriveBootLogEntries(config, items, selectedServiceName);
  const selectedService =
    services.find((service) => service.service_name === selectedServiceName) ?? null;
  const selectedPreviewUrl = selectedService ? resolvePreviewUrl(selectedService) : null;
  const selectedStatusReason = selectedService
    ? formatServiceStatusReason(selectedService.status_reason)
    : null;

  if (items.length === 0) {
    return (
      <EmptyState
        description="Boot logs appear here after Lifecycle captures setup or environment-task output."
        icon={<ScrollText />}
        size="sm"
        title="No boot logs yet"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
            {selectedServiceName ? "Service boot logs" : "Boot logs"}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-medium text-[var(--foreground)]">
              {selectedServiceName ?? "Workspace boot"}
            </h3>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {scopeDescription(selectedServiceName)}
          </p>
        </div>
        {selectedServiceName && onClearSelectedService ? (
          <Button onClick={onClearSelectedService} size="sm" variant="ghost">
            Show all
          </Button>
        ) : null}
      </div>

      {selectedService ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/45 px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
          <span>Status {selectedService.status}</span>
          {selectedService.effective_port !== null ? (
            <span className="font-mono">:{selectedService.effective_port}</span>
          ) : null}
          {selectedPreviewUrl ? (
            <span className="min-w-0 truncate font-mono">{selectedPreviewUrl}</span>
          ) : null}
          {selectedStatusReason ? (
            <span className="text-[var(--destructive)]">{selectedStatusReason}</span>
          ) : null}
        </div>
      ) : null}

      {logEntries.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {logEntries.map((entry) => (
            <section
              className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/45"
              key={entry.id}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--foreground)]">
                    {entry.name}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                    {entry.kind === "setup" ? "Workspace setup" : "Environment task"}
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
      ) : (
        <EmptyState
          description={
            selectedServiceName
              ? `Lifecycle has not captured setup or environment-task output for ${selectedServiceName} yet.`
              : "Lifecycle has not captured setup or environment-task output for this boot yet."
          }
          icon={<ScrollText />}
          size="sm"
          title="No captured boot output"
        />
      )}
    </div>
  );
}

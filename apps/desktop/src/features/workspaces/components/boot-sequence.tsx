import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, IconButton } from "@lifecycle/ui";
import { LoaderCircle, Play } from "lucide-react";
import { useState } from "react";
import { ServiceRow } from "./services-tab";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";

type BootSequenceItemStatus = SetupStepState["status"];

export type BootPresentationPhase = "completed" | "failed" | "running";

export interface BootPresentation {
  completedSteps: number;
  currentStepIndex: number;
  currentStepName: string;
  phase: BootPresentationPhase;
  totalSteps: number;
}

interface BootSequenceBaseItem {
  id: string;
  name: string;
  status: BootSequenceItemStatus;
}

interface BootSequenceSetupItem extends BootSequenceBaseItem {
  kind: "setup";
  output: string[];
}

interface BootSequenceTaskItem extends BootSequenceBaseItem {
  kind: "task";
  output: string[];
}

interface BootSequenceServiceItem extends BootSequenceBaseItem {
  kind: "service";
  port: number | null;
  runtime: "image" | "process" | null;
  service: ServiceRecord | null;
}

export type BootSequenceItem =
  | BootSequenceSetupItem
  | BootSequenceTaskItem
  | BootSequenceServiceItem;

interface BootStatusIndicatorProps {
  isActive?: boolean;
  status: BootSequenceItemStatus;
}

const DOT_STYLES: Record<BootSequenceItemStatus, string> = {
  pending: "bg-[var(--muted-foreground)]/40",
  running: "bg-[var(--status-info)] lifecycle-motion-soft-pulse",
  completed: "bg-[var(--status-success)]",
  failed: "bg-[var(--status-danger)]",
  timeout: "bg-[var(--status-danger)]",
};

const NAME_STYLES: Record<BootSequenceItemStatus, string> = {
  pending: "text-[var(--muted-foreground)]",
  running: "text-[var(--foreground)]",
  completed: "text-[var(--foreground)]",
  failed: "text-[var(--foreground)]",
  timeout: "text-[var(--foreground)]",
};

function shouldRunOn(
  runOn: "create" | "start" | null | undefined,
  setupCompleted: boolean,
): boolean {
  return runOn === "start" || !setupCompleted;
}

function shouldIncludeEnvironmentNode(
  node: LifecycleConfig["environment"][string],
  setupCompleted: boolean,
): boolean {
  if (node.kind !== "task") {
    return true;
  }

  return shouldRunOn(node.run_on ?? null, setupCompleted);
}

function insertSorted(values: string[], nextValue: string): void {
  let index = 0;
  while (index < values.length && values[index]!.localeCompare(nextValue) < 0) {
    index += 1;
  }
  values.splice(index, 0, nextValue);
}

function mergeDeclaredAndObserved(
  declaredNames: string[],
  observedItems: Array<{ name: string }>,
): string[] {
  const mergedNames = [...declaredNames];
  const knownNames = new Set(declaredNames);

  for (const item of observedItems) {
    if (knownNames.has(item.name)) {
      continue;
    }
    knownNames.add(item.name);
    mergedNames.push(item.name);
  }

  return mergedNames;
}

function mapServiceStatus(service: ServiceRecord | null): BootSequenceItemStatus {
  if (!service) {
    return "pending";
  }

  switch (service.status) {
    case "ready":
      return "completed";
    case "starting":
      return "running";
    case "failed":
      return "failed";
    case "stopped":
      return "pending";
  }
}

function orderEnvironmentNodes(
  environment: LifecycleConfig["environment"],
  setupCompleted: boolean,
): string[] {
  const entries = Object.entries(environment).filter(([, node]) =>
    shouldIncludeEnvironmentNode(node, setupCompleted),
  );
  const nodeNames = new Set(entries.map(([name]) => name));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const [name] of entries) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }

  for (const [name, node] of entries) {
    for (const dependency of node.depends_on ?? []) {
      if (!nodeNames.has(dependency)) {
        continue;
      }
      dependents.get(dependency)?.push(name);
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }

  const ready = Array.from(inDegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];

  while (ready.length > 0) {
    const nextName = ready.shift()!;
    ordered.push(nextName);

    for (const dependent of dependents.get(nextName) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) {
        insertSorted(ready, dependent);
      }
    }
  }

  if (ordered.length === entries.length) {
    return ordered;
  }

  const unresolved = entries
    .map(([name]) => name)
    .filter((name) => !ordered.includes(name))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...unresolved];
}

export function deriveBootSequenceItems(
  config: LifecycleConfig | null,
  declaredStepNames: string[],
  setupSteps: SetupStepState[],
  environmentTasks: EnvironmentTaskState[],
  services: ServiceRecord[],
  serviceRuntimeByName: Partial<Record<string, "image" | "process">>,
  setupCompleted = false,
): BootSequenceItem[] {
  const items: BootSequenceItem[] = [];
  const setupStepByName = new Map(setupSteps.map((step) => [step.name, step]));
  const taskByName = new Map(environmentTasks.map((task) => [task.name, task]));
  const serviceByName = new Map(services.map((service) => [service.service_name, service]));

  const setupNames = mergeDeclaredAndObserved(
    config?.workspace.setup
      .filter((step) => shouldRunOn(step.run_on ?? null, setupCompleted))
      .map((step) => step.name) ?? declaredStepNames,
    setupSteps,
  );

  for (const name of setupNames) {
    const step = setupStepByName.get(name);
    items.push({
      id: `setup:${name}`,
      kind: "setup",
      name,
      output: step?.output ?? [],
      status: step?.status ?? "pending",
    });
  }

  if (config) {
    const orderedNodeNames = orderEnvironmentNodes(config.environment, setupCompleted);
    const knownNodeNames = new Set(orderedNodeNames);

    for (const nodeName of orderedNodeNames) {
      const node = config.environment[nodeName]!;
      if (node.kind === "task") {
        const task = taskByName.get(nodeName);
        items.push({
          id: `task:${nodeName}`,
          kind: "task",
          name: nodeName,
          output: task?.output ?? [],
          status: task?.status ?? "pending",
        });
        continue;
      }

      const service = serviceByName.get(nodeName) ?? null;
      items.push({
        id: `service:${nodeName}`,
        kind: "service",
        name: nodeName,
        port: service?.effective_port ?? node.port ?? null,
        runtime: serviceRuntimeByName[nodeName] ?? node.runtime,
        service,
        status: mapServiceStatus(service),
      });
    }

    for (const task of environmentTasks) {
      if (knownNodeNames.has(task.name)) {
        continue;
      }
      items.push({
        id: `task:${task.name}`,
        kind: "task",
        name: task.name,
        output: task.output,
        status: task.status,
      });
    }

    const runtimeOrder: Record<string, number> = { image: 0, process: 1 };
    const extraServices = services
      .filter((service) => !knownNodeNames.has(service.service_name))
      .sort((a, b) => {
        const aOrder = runtimeOrder[serviceRuntimeByName[a.service_name] ?? ""] ?? 2;
        const bOrder = runtimeOrder[serviceRuntimeByName[b.service_name] ?? ""] ?? 2;
        return aOrder - bOrder || a.service_name.localeCompare(b.service_name);
      });

    for (const service of extraServices) {
      items.push({
        id: `service:${service.service_name}`,
        kind: "service",
        name: service.service_name,
        port: service.effective_port,
        runtime: serviceRuntimeByName[service.service_name] ?? null,
        service,
        status: mapServiceStatus(service),
      });
    }

    return items;
  }

  for (const task of environmentTasks) {
    items.push({
      id: `task:${task.name}`,
      kind: "task",
      name: task.name,
      output: task.output,
      status: task.status,
    });
  }

  const runtimeOrder: Record<string, number> = { image: 0, process: 1 };
  const sortedServices = [...services].sort((a, b) => {
    const aOrder = runtimeOrder[serviceRuntimeByName[a.service_name] ?? ""] ?? 2;
    const bOrder = runtimeOrder[serviceRuntimeByName[b.service_name] ?? ""] ?? 2;
    return aOrder - bOrder || a.service_name.localeCompare(b.service_name);
  });

  for (const service of sortedServices) {
    items.push({
      id: `service:${service.service_name}`,
      kind: "service",
      name: service.service_name,
      port: service.effective_port,
      runtime: serviceRuntimeByName[service.service_name] ?? null,
      service,
      status: mapServiceStatus(service),
    });
  }

  return items;
}

export function deriveBootPresentation(
  items: BootSequenceItem[],
  workspace: Pick<WorkspaceRecord, "failure_reason" | "status">,
): BootPresentation | null {
  if (items.length === 0) {
    return null;
  }

  const failedIndex = items.findIndex(
    (item) => item.status === "failed" || item.status === "timeout",
  );
  const runningIndex = items.findIndex((item) => item.status === "running");
  const pendingIndex = items.findIndex((item) => item.status === "pending");
  const completedSteps = items.filter((item) => item.status === "completed").length;
  const totalSteps = items.length;
  const allCompleted = completedSteps === totalSteps;

  if (workspace.status === "idle" && workspace.failure_reason) {
    const failedItemIndex = failedIndex >= 0 ? failedIndex : pendingIndex >= 0 ? pendingIndex : 0;
    const failedItem = items[failedItemIndex]!;
    return {
      completedSteps,
      currentStepIndex: failedItemIndex,
      currentStepName: failedItem.name,
      phase: "failed",
      totalSteps,
    };
  }

  if (workspace.status === "starting" || runningIndex >= 0) {
    const activeIndex =
      runningIndex >= 0
        ? runningIndex
        : pendingIndex >= 0
          ? pendingIndex
          : Math.max(completedSteps, 0);
    const activeItem = items[Math.min(activeIndex, totalSteps - 1)]!;
    return {
      completedSteps,
      currentStepIndex: Math.min(activeIndex, totalSteps - 1),
      currentStepName: activeItem.name,
      phase: "running",
      totalSteps,
    };
  }

  if (workspace.status === "active" || allCompleted) {
    const currentStepIndex = totalSteps - 1;
    const currentItem = items[currentStepIndex]!;
    return {
      completedSteps,
      currentStepIndex,
      currentStepName: currentItem.name,
      phase: "completed",
      totalSteps,
    };
  }

  return null;
}

function BootStatusIndicator({ isActive = false, status }: BootStatusIndicatorProps) {
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      {isActive ? (
        <LoaderCircle className="size-3 animate-spin text-[var(--status-info)]" strokeWidth={2.2} />
      ) : (
        <span className={`inline-block size-[6px] rounded-full ${DOT_STYLES[status]}`} />
      )}
    </span>
  );
}

function BootStepRow({
  isActive = false,
  item,
}: {
  isActive?: boolean;
  item: BootSequenceSetupItem | BootSequenceTaskItem;
}) {
  const [open, setOpen] = useState(item.status === "running");
  const hasOutput = item.output.length > 0;
  const nameClassName = isActive ? NAME_STYLES.running : NAME_STYLES[item.status];

  return (
    <Collapsible onOpenChange={setOpen} open={hasOutput ? open : false}>
      <CollapsibleTrigger asChild>
        <button
          className={`flex w-full items-center gap-2.5 py-1 text-left ${hasOutput ? "cursor-pointer" : "cursor-default"}`}
          disabled={!hasOutput}
          type="button"
        >
          <BootStatusIndicator isActive={isActive} status={item.status} />
          <span className={`min-w-0 truncate text-[13px] ${nameClassName}`}>{item.name}</span>
        </button>
      </CollapsibleTrigger>
      {hasOutput ? (
        <CollapsibleContent>
          <div className="mb-1 ml-[22px] rounded-md bg-[var(--muted)]/50 px-2.5 py-2">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--muted-foreground)]">
              {item.output.join("\n")}
            </pre>
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function BootServiceRow({
  isActive = false,
  item,
  onOpenLogs,
  onStartService,
  runDisabled = false,
  runPending = false,
}: {
  isActive?: boolean;
  item: BootSequenceServiceItem;
  onOpenLogs?: ((serviceName: string) => void) | undefined;
  onStartService?: ((serviceName: string) => void) | undefined;
  runDisabled?: boolean;
  runPending?: boolean;
}) {
  const portLabel = item.port !== null ? `:${item.port}` : null;
  const nameClassName = isActive ? NAME_STYLES.running : NAME_STYLES[item.status];
  const rowContent = (
    <>
      <BootStatusIndicator isActive={isActive} status={item.status} />
      <span className={`min-w-0 truncate text-[13px] ${nameClassName}`}>{item.name}</span>
      {portLabel ? (
        <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--muted-foreground)]">
          {portLabel}
        </span>
      ) : null}
    </>
  );

  if (onOpenLogs || onStartService) {
    return (
      <div className="flex items-center gap-2">
        <button
          className="flex w-full items-center gap-2.5 py-1 text-left transition-colors"
          onClick={() => onOpenLogs?.(item.name)}
          title={onOpenLogs ? `Show boot logs for ${item.name}` : undefined}
          type="button"
        >
          {rowContent}
        </button>
        {onStartService && item.status === "pending" ? (
          <IconButton
            aria-label={`Run ${item.name} and its dependencies`}
            disabled={runDisabled}
            onClick={() => onStartService(item.name)}
            title={`Run ${item.name} and its dependencies`}
          >
            {runPending ? (
              <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />
            ) : (
              <Play className="size-3.5 fill-current" strokeWidth={2.2} />
            )}
          </IconButton>
        ) : null}
      </div>
    );
  }

  return <div className="flex w-full items-center gap-2.5 py-1">{rowContent}</div>;
}

interface BootSequenceProps {
  config: LifecycleConfig | null;
  declaredStepNames: string[];
  environmentTasks: EnvironmentTaskState[];
  onOpenServiceLogs?: (serviceName: string) => void;
  onStartService?: (serviceName: string) => void;
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  runDisabled?: boolean;
  runningServiceName?: string | null;
  serviceRuntimeByName: Partial<Record<string, "image" | "process">>;
  services: ServiceRecord[];
  setupSteps: SetupStepState[];
  workspace: Pick<WorkspaceRecord, "failure_reason" | "status" | "setup_completed_at">;
}

export function BootSequence({
  config,
  declaredStepNames,
  environmentTasks,
  onOpenServiceLogs,
  onStartService,
  onUpdateService,
  runDisabled = false,
  runningServiceName = null,
  serviceRuntimeByName,
  services,
  setupSteps,
  workspace,
}: BootSequenceProps) {
  const items = deriveBootSequenceItems(
    config,
    declaredStepNames,
    setupSteps,
    environmentTasks,
    services,
    serviceRuntimeByName,
    workspace.setup_completed_at !== null && workspace.setup_completed_at !== undefined,
  );
  const presentation = deriveBootPresentation(items, workspace);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {items.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {items.map((item, index) => {
            const isActive =
              presentation?.phase === "running" && presentation.currentStepIndex === index;
            return item.kind === "service" ? (
              item.service ? (
                <ServiceRow
                  key={item.id}
                  onOpenLogs={onOpenServiceLogs}
                  onStartService={onStartService}
                  onUpdateService={onUpdateService}
                  runDisabled={runDisabled}
                  runPending={runningServiceName === item.name}
                  runtime={item.runtime}
                  service={item.service}
                  statusAffordance="indicator"
                />
              ) : (
                <BootServiceRow
                  isActive={isActive}
                  key={item.id}
                  item={item}
                  onOpenLogs={onOpenServiceLogs}
                  onStartService={onStartService}
                  runDisabled={runDisabled}
                  runPending={runningServiceName === item.name}
                />
              )
            ) : (
              <BootStepRow isActive={isActive} key={item.id} item={item} />
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--muted-foreground)]">No environment nodes defined.</p>
      )}
    </div>
  );
}

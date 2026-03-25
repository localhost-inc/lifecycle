import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { Alert, AlertDescription } from "@lifecycle/ui";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServiceLogSnapshot } from "@/features/workspaces/api";
import { useWorkspaceServiceLogs } from "@/features/workspaces/hooks";
import { formatWorkspaceError } from "@/features/workspaces/lib/workspace-errors";
import { ServiceRow } from "@/features/workspaces/components/service-row";

interface EnvironmentPanelProps {
  config: LifecycleConfig | null;
  hasManifest: boolean;
  manifestState: "invalid" | "missing" | "valid";
  onOpenPreview: (service: Pick<ServiceRecord, "name" | "preview_url">) => void;
  onRun: (serviceNames?: string[]) => Promise<void>;
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}

function getServiceRuntimeByName(
  config: LifecycleConfig | null,
): Partial<Record<string, "image" | "process">> {
  if (!config) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(config.environment)
      .filter(
        (
          entry,
        ): entry is [
          string,
          Extract<LifecycleConfig["environment"][string], { kind: "service" }>,
        ] => entry[1].kind === "service",
      )
      .map(([name, node]) => [name, node.runtime]),
  );
}

/** Sort services in topological (dependency) order using config's depends_on. */
function sortByDependencyOrder<T extends { name: string }>(
  items: T[],
  environment: LifecycleConfig["environment"] | undefined,
): T[] {
  if (!environment || items.length <= 1) return items;

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const itemNames = new Set(items.map((s) => s.name));

  for (const name of itemNames) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }

  for (const name of itemNames) {
    const node = environment[name];
    if (!node?.depends_on) continue;
    for (const dep of node.depends_on) {
      if (!itemNames.has(dep)) continue;
      dependents.get(dep)!.push(name);
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }

  // Kahn's algorithm — stable within each layer (preserves input order)
  const queue: string[] = [];
  for (const item of items) {
    if (inDegree.get(item.name) === 0) queue.push(item.name);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const dep of dependents.get(current) ?? []) {
      const remaining = inDegree.get(dep)! - 1;
      inDegree.set(dep, remaining);
      if (remaining === 0) queue.push(dep);
    }
  }

  // Append any items not reached (cycle or missing from config)
  for (const item of items) {
    if (!sorted.includes(item.name)) sorted.push(item.name);
  }

  const order = new Map(sorted.map((name, i) => [name, i]));
  return [...items].sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
}

function getInitialExpandedServiceName(
  workspace: Pick<WorkspaceRecord, "status" | "failure_reason">,
  services: ServiceRecord[],
  serviceLogs: ServiceLogSnapshot[],
): string | null {
  if (
    workspace.status === "provisioning" ||
    services.some((service) => service.status === "starting")
  ) {
    return (
      services.find((service) => service.status === "starting")?.name ??
      serviceLogs.find((log) => log.lines.length > 0)?.name ??
      null
    );
  }

  if (
    workspace.failure_reason !== null ||
    services.some((service) => service.status === "failed")
  ) {
    return (
      services.find((service) => service.status === "failed")?.name ??
      serviceLogs.find((log) => log.lines.length > 0)?.name ??
      services[0]?.name ??
      null
    );
  }

  return null;
}

export function EnvironmentPanel({
  config,
  hasManifest,
  manifestState,
  onOpenPreview,
  onRun,
  services,
  workspace,
}: EnvironmentPanelProps) {
  const [activeServiceStartName, setActiveServiceStartName] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const serviceLogsQuery = useWorkspaceServiceLogs(workspace.id);
  const serviceLogs = serviceLogsQuery.data ?? [];
  const [expandedServiceName, setExpandedServiceName] = useState<string | null>(() =>
    getInitialExpandedServiceName(workspace, services, serviceLogs),
  );
  const prevIsRunningRef = useRef(false);
  const serviceRuntimeByName = useMemo(() => getServiceRuntimeByName(config), [config]);
  const serviceLogsByName = useMemo(
    () => new Map(serviceLogs.map((log) => [log.name, log.lines])),
    [serviceLogs],
  );
  const declaredServiceCount = useMemo(
    () => Object.values(config?.environment ?? {}).filter((node) => node.kind === "service").length,
    [config],
  );
  const workspaceStatus = workspace.status;
  const workspaceFailureReason = workspace.failure_reason;
  const hasStartingService = services.some((service) => service.status === "starting");
  const hasReadyService = services.some((service) => service.status === "ready");
  const hasFailedService = services.some((service) => service.status === "failed");
  const isArchiving = workspaceStatus === "archiving";
  const isArchived = workspaceStatus === "archived";
  const canStartService = hasManifest && workspaceStatus === "active" && !isArchiving;
  const showServiceLogs =
    !isArchived &&
    (hasStartingService ||
      hasReadyService ||
      hasFailedService ||
      workspaceFailureReason !== null ||
      serviceLogs.length > 0);
  const hasServiceContent = services.length > 0 || serviceLogs.length > 0;
  const serviceNameSet = useMemo(() => new Set(services.map((s) => s.name)), [services]);

  const handleOpenServiceLogs = useCallback((serviceName: string) => {
    setExpandedServiceName((current) => (current === serviceName ? null : serviceName));
  }, []);

  async function handleRunService(serviceName: string): Promise<void> {
    if (!canStartService || activeServiceStartName !== null) {
      return;
    }

    setActionError(null);
    setActiveServiceStartName(serviceName);
    setExpandedServiceName(serviceName);

    try {
      await onRun([serviceName]);
    } catch (error) {
      setActionError(formatWorkspaceError(error, `Failed to start ${serviceName}.`));
    } finally {
      setActiveServiceStartName(null);
    }
  }

  useEffect(() => {
    const isRunning = workspaceStatus === "active" && !hasStartingService && hasReadyService;
    const wasRunning = prevIsRunningRef.current;
    prevIsRunningRef.current = isRunning;

    // Auto-collapse only on the transition to running, not on every poll
    if (isRunning && !wasRunning) {
      setExpandedServiceName(null);
      return;
    }

    // Once in steady running state, don't override user's expand/collapse choice
    if (isRunning) {
      return;
    }

    const preferredExpandedServiceName = getInitialExpandedServiceName(
      workspace,
      services,
      serviceLogs,
    );
    if (preferredExpandedServiceName !== null) {
      setExpandedServiceName(preferredExpandedServiceName);
    }
  }, [hasReadyService, hasStartingService, serviceLogs, services, workspace, workspaceStatus]);

  const configPrepareSteps = config?.workspace?.prepare ?? [];

  function renderServiceList() {
    if (!hasServiceContent && configPrepareSteps.length === 0) {
      return null;
    }

    // Build prepare step entries from config (always shown if defined),
    // plus any log-only entries not in config or services
    const configPrepareNames = new Set(configPrepareSteps.map((s) => s.name));
    const prepareStepEntries: ServiceRecord[] = [
      ...configPrepareSteps.map((step, index) => ({
        id: `prepare-log:${step.name}:${index}`,
        workspace_id: workspace.id,
        name: step.name,
        status: "stopped" as const,
        status_reason: null,
        assigned_port: null,
        preview_url: null,
        created_at: workspace.updated_at,
        updated_at: workspace.updated_at,
      })),
      ...serviceLogs
        .filter((log) => !serviceNameSet.has(log.name) && !configPrepareNames.has(log.name))
        .map((log, index) => ({
          id: `prepare-log:${log.name}:${configPrepareSteps.length + index}`,
          workspace_id: workspace.id,
          name: log.name,
          status: "stopped" as const,
          status_reason: null,
          assigned_port: null,
          preview_url: null,
          created_at: workspace.updated_at,
          updated_at: workspace.updated_at,
        })),
    ];

    const sortedServices = sortByDependencyOrder(services, config?.environment);

    const renderedServices =
      sortedServices.length > 0 || prepareStepEntries.length > 0
        ? [...prepareStepEntries, ...sortedServices]
        : serviceLogs.map((log, index) => ({
            id: `service-log:${log.name}:${index}`,
            workspace_id: workspace.id,
            name: log.name,
            status: "stopped" as const,
            status_reason: null,
            assigned_port: null,
            preview_url: null,
            created_at: workspace.updated_at,
            updated_at: workspace.updated_at,
          }));

    return (
      <div className="shrink-0">
        {renderedServices.map((service) => {
          const isPrepareStep = service.id.startsWith("prepare-log:");
          return (
            <ServiceRow
              expanded={showServiceLogs ? expandedServiceName === service.name : undefined}
              key={service.id}
              logLines={showServiceLogs ? serviceLogsByName.get(service.name) : undefined}
              onOpenPreview={isPrepareStep ? undefined : onOpenPreview}
              onStartService={
                isPrepareStep ? undefined : (serviceName) => void handleRunService(serviceName)
              }
              onToggleExpanded={
                showServiceLogs ? () => handleOpenServiceLogs(service.name) : undefined
              }
              runDisabled={!canStartService || activeServiceStartName !== null}
              runPending={activeServiceStartName === service.name}
              runtime={isPrepareStep ? null : (serviceRuntimeByName[service.name] ?? null)}
              service={service}
            />
          );
        })}
      </div>
    );
  }

  function renderEmptyState() {
    if (manifestState === "missing") {
      return (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            Add a{" "}
            <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-[11px]">
              lifecycle.json
            </code>{" "}
            to configure this workspace environment.
          </p>
        </div>
      );
    }

    if (manifestState === "invalid") {
      return (
        <div className="px-3 pt-3">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              lifecycle.json is invalid. Fix it before starting this workspace.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (declaredServiceCount === 0) {
      return (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            No services are declared in{" "}
            <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-[11px]">
              lifecycle.json
            </code>
            .
          </p>
        </div>
      );
    }

    return null;
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      {actionError && (
        <div className="shrink-0 px-3 pt-3 pb-1">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {renderServiceList() ?? renderEmptyState()}
      </div>

    </section>
  );
}

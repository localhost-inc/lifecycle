import type {
  EnvironmentRecord,
  LifecycleConfig,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { Alert, AlertDescription, Button } from "@lifecycle/ui";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ServiceLogSnapshot } from "@/features/workspaces/api";
import { useWorkspaceServiceLogs } from "@/features/workspaces/hooks";
import { formatWorkspaceError } from "@/features/workspaces/lib/workspace-errors";
import { ServiceRow } from "@/features/workspaces/components/service-row";

const FAILURE_REASON_LABELS: Record<string, string> = {
  capacity_unavailable: "No capacity available to run this workspace.",
  environment_task_failed: "An environment task failed.",
  local_app_not_running: "Stopped because the app was quit while running.",
  local_docker_unavailable: "Docker is not available on this machine.",
  local_port_conflict: "A required port is already in use.",
  manifest_invalid: "lifecycle.json is invalid.",
  operation_timeout: "The operation timed out.",
  repo_clone_failed: "Failed to clone the repository.",
  repository_disconnected: "Lost connection to the repository.",
  sandbox_unreachable: "The sandbox is unreachable.",
  service_healthcheck_failed: "A service health check failed.",
  service_start_failed: "A service failed to start.",
  prepare_step_failed: "A workspace prepare step failed.",
};

interface EnvironmentPanelProps {
  config: LifecycleConfig | null;
  hasManifest: boolean;
  manifestState: "invalid" | "missing" | "valid";
  onRestart: () => Promise<void>;
  onRun: (serviceNames?: string[]) => Promise<void>;
  onStop: () => Promise<void>;
  environment: EnvironmentRecord;
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

function getInitialExpandedServiceName(
  environment: EnvironmentRecord,
  services: ServiceRecord[],
  serviceLogs: ServiceLogSnapshot[],
): string | null {
  if (environment.status === "starting") {
    return (
      services.find((service) => service.status === "starting")?.name ??
      serviceLogs.find((log) => log.lines.length > 0)?.name ??
      null
    );
  }

  if (environment.failure_reason !== null) {
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
  environment,
  hasManifest,
  manifestState,
  onRestart,
  onRun,
  onStop,
  services,
  workspace,
}: EnvironmentPanelProps) {
  const [activeServiceStartName, setActiveServiceStartName] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const serviceLogsQuery = useWorkspaceServiceLogs(workspace.id);
  const serviceLogs = serviceLogsQuery.data ?? [];
  const [expandedServiceName, setExpandedServiceName] = useState<string | null>(() =>
    getInitialExpandedServiceName(environment, services, serviceLogs),
  );
  const serviceRuntimeByName = useMemo(() => getServiceRuntimeByName(config), [config]);
  const serviceLogsByName = useMemo(
    () => new Map(serviceLogs.map((log) => [log.name, log.lines])),
    [serviceLogs],
  );
  const declaredServiceCount = useMemo(
    () => Object.values(config?.environment ?? {}).filter((node) => node.kind === "service").length,
    [config],
  );
  const environmentStatus = environment.status;
  const environmentFailureReason = environment.failure_reason;

  const canStartService =
    hasManifest && (environmentStatus === "idle" || environmentStatus === "running");
  const [runActionBusy, setRunActionBusy] = useState(false);
  const canRun = hasManifest && environmentStatus === "idle";
  const canStop = environmentStatus === "starting" || environmentStatus === "running";
  const canRestart = environmentStatus === "running" && hasManifest;
  const stopping = environmentStatus === "stopping";
  const isFailed = environmentStatus === "idle" && environmentFailureReason !== null;
  const isTransitioning =
    environmentStatus === "starting" || environmentStatus === "stopping";
  const isRunning = environmentStatus === "running";
  const showServiceLogs = environmentStatus !== "idle" || environmentFailureReason !== null;
  const hasServiceContent = services.length > 0 || serviceLogs.length > 0;
  const showRunActions = canStop || hasManifest;

  const handleRunAction = useCallback(async () => {
    if (runActionBusy) {
      return;
    }
    setRunActionBusy(true);
    try {
      if (canStop) {
        await onStop();
      } else if (canRun) {
        await onRun();
      }
    } catch (error) {
      console.error("Run action failed:", error);
    } finally {
      setRunActionBusy(false);
    }
  }, [canRun, canStop, onRun, onStop, runActionBusy]);

  const handleRestartAction = useCallback(async () => {
    if (runActionBusy || !canRestart) {
      return;
    }
    setRunActionBusy(true);
    try {
      await onRestart();
    } catch (error) {
      console.error("Restart failed:", error);
    } finally {
      setRunActionBusy(false);
    }
  }, [canRestart, onRestart, runActionBusy]);

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
    const preferredExpandedServiceName = getInitialExpandedServiceName(
      environment,
      services,
      serviceLogs,
    );
    if (environmentStatus === "running") {
      setExpandedServiceName(null);
      return;
    }
    if (preferredExpandedServiceName !== null) {
      setExpandedServiceName(preferredExpandedServiceName);
    }
  }, [environment, environmentStatus, serviceLogs, services]);

  const runButtonLabel =
    environmentStatus === "starting"
      ? "Starting..."
      : stopping || (runActionBusy && canStop)
        ? "Stopping..."
        : canStop
          ? "Stop"
          : runActionBusy
            ? "Starting..."
            : "Start";

  const runButtonDisabled = runActionBusy || stopping || (!canRun && !canStop);

  const statusLabel = isTransitioning
    ? environmentStatus === "stopping"
      ? "Stopping"
      : "Starting"
    : isRunning
      ? "Running"
      : isFailed
        ? "Failed"
        : "Idle";

  const statusDotClass = isRunning
    ? "bg-[var(--status-success)]"
    : isTransitioning
      ? "bg-[var(--status-info)] lifecycle-motion-soft-pulse"
      : isFailed
        ? "bg-[var(--status-danger)]"
        : "bg-[var(--muted-foreground)]/40";

  function renderServiceList() {
    if (!hasServiceContent) {
      return null;
    }

    const renderedServices =
      services.length > 0
            ? services
          : serviceLogs.map((log, index) => ({
              id: `service-log:${log.name}:${index}`,
              environment_id: environment.workspace_id,
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
        {renderedServices.map((service) => (
          <ServiceRow
            expanded={showServiceLogs ? expandedServiceName === service.name : undefined}
            key={service.id}
            logLines={showServiceLogs ? serviceLogsByName.get(service.name) : undefined}
            onStartService={(serviceName) => void handleRunService(serviceName)}
            onToggleExpanded={
              showServiceLogs ? () => handleOpenServiceLogs(service.name) : undefined
            }
            runDisabled={!canStartService || activeServiceStartName !== null}
            runPending={activeServiceStartName === service.name}
            runtime={serviceRuntimeByName[service.name] ?? null}
            service={service}
          />
        ))}
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
      {!isRunning && (
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block size-[7px] shrink-0 rounded-full ${statusDotClass}`} />
            <span className="text-[13px] font-medium text-[var(--foreground)]">{statusLabel}</span>
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 pb-1 flex flex-col gap-2">
        {isFailed && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              {environmentFailureReason === null
                ? null
                : FAILURE_REASON_LABELS[environmentFailureReason] ?? environmentFailureReason}
            </AlertDescription>
          </Alert>
        )}
        {isRunning && manifestState === "invalid" && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              lifecycle.json is invalid. Current services keep running until you stop them.
            </AlertDescription>
          </Alert>
        )}
        {actionError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {renderServiceList() ?? renderEmptyState()}
      </div>

      {showRunActions && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2.5 pb-2.5">
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              className="px-8"
              disabled={runButtonDisabled}
              onClick={() => void handleRunAction()}
              size="lg"
              variant="glass"
            >
              {runButtonLabel}
            </Button>
            {canRestart && (
              <Button
                disabled={runActionBusy}
                onClick={() => void handleRestartAction()}
                size="lg"
                variant="glass"
              >
                Restart
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  Alert,
  AlertDescription,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@lifecycle/ui";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { BootSequence, deriveBootPresentation, deriveBootSequenceItems } from "./boot-sequence";
import { collectEnvironmentAncestors } from "./logs-tab";
import { ServiceRow } from "./services-tab";
import type {
  EnvironmentTaskState,
  ServiceLogLine,
  ServiceLogState,
  SetupStepState,
} from "../hooks";
import { formatWorkspaceError } from "../lib/workspace-errors";

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
  setup_step_failed: "A setup step failed.",
};

interface EnvironmentPanelProps {
  config: LifecycleConfig | null;
  hasManifest: boolean;
  isManifestStale: boolean;
  manifestState: "invalid" | "missing" | "valid";
  onRestart: () => Promise<void>;
  onRun: (serviceNames?: string[]) => Promise<void>;
  onStop: () => Promise<void>;
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  environmentTasks: EnvironmentTaskState[];
  serviceLogs?: ServiceLogState[];
  setupSteps: SetupStepState[];
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}

export function EnvironmentPanel({
  config,
  hasManifest,
  isManifestStale,
  manifestState,
  onRestart,
  onRun,
  onStop,
  onUpdateService,
  environmentTasks,
  serviceLogs = [],
  setupSteps,
  services,
  workspace,
}: EnvironmentPanelProps) {
  const [activeServiceStartName, setActiveServiceStartName] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedServiceName, setExpandedServiceName] = useState<string | null>(null);

  const declaredSetupStepNames = (config?.workspace.setup ?? []).map((step) => step.name);
  const serviceRuntimeByName = Object.fromEntries(
    Object.entries(config?.environment ?? {})
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

  const canStartService =
    hasManifest && (workspace.status === "idle" || workspace.status === "active");

  // Boot sequence items and presentation
  const bootItems = deriveBootSequenceItems(
    config,
    declaredSetupStepNames,
    setupSteps,
    environmentTasks,
    services,
    serviceRuntimeByName,
    workspace.setup_completed_at !== null && workspace.setup_completed_at !== undefined,
  );
  const bootStepItems = bootItems.filter((item) => item.kind !== "service");
  const bootPresentation = deriveBootPresentation(bootStepItems, workspace);

  // Run action state
  const [runActionBusy, setRunActionBusy] = useState(false);
  const canRun = hasManifest && workspace.status === "idle";
  const canStop = workspace.status === "active" || workspace.status === "starting";
  const canRestart = workspace.status === "active" && hasManifest;
  const stopping = workspace.status === "stopping";

  const handleRunAction = useCallback(async () => {
    if (runActionBusy) return;
    setRunActionBusy(true);
    try {
      if (canStop) {
        await onStop();
      } else if (canRun) {
        await onRun();
      }
    } catch (err) {
      console.error("Run action failed:", err);
    } finally {
      setRunActionBusy(false);
    }
  }, [canRun, canStop, onRun, onStop, runActionBusy]);

  const handleRestartAction = useCallback(async () => {
    if (runActionBusy || !canRestart) return;
    setRunActionBusy(true);
    try {
      await onRestart();
    } catch (err) {
      console.error("Restart failed:", err);
    } finally {
      setRunActionBusy(false);
    }
  }, [canRestart, onRestart, runActionBusy]);

  const runButtonLabel =
    workspace.status === "starting"
      ? "Starting..."
      : stopping || (runActionBusy && canStop)
        ? "Stopping..."
        : canStop
          ? "Stop"
          : runActionBusy
            ? "Starting..."
            : "Start";

  const runButtonDisabled = runActionBusy || stopping || (!canRun && !canStop);

  // Auto-collapse boot card on terminal state, expand when booting
  const isTerminal =
    workspace.status === "active" ||
    (workspace.status === "idle" && workspace.failure_reason !== null);
  const [bootExpanded, setBootExpanded] = useState(!isTerminal);
  useEffect(() => {
    setBootExpanded(!isTerminal);
  }, [isTerminal]);

  // Build per-service merged log lines: boot output (setup steps + dep tasks) + runtime logs
  const serviceLogsByName = new Map<string, ServiceLogLine[]>();
  for (const svc of services) {
    const lines: ServiceLogLine[] = [];

    // Prepend boot output: setup steps are global, tasks are per-dependency-chain
    const ancestors = config
      ? collectEnvironmentAncestors(config, svc.service_name)
      : new Set<string>();

    for (const step of setupSteps) {
      for (const line of step.output) {
        lines.push({ stream: "stdout", text: line });
      }
    }

    for (const task of environmentTasks) {
      if (ancestors.has(task.name)) {
        for (const line of task.output) {
          lines.push({ stream: "stdout", text: line });
        }
      }
    }

    // Append runtime service logs
    const runtimeLog = serviceLogs.find((log) => log.serviceName === svc.service_name);
    if (runtimeLog) {
      lines.push(...runtimeLog.lines);
    }

    if (lines.length > 0) {
      serviceLogsByName.set(svc.service_name, lines);
    }
  }

  // Auto-expand the first booting service, auto-collapse when all active
  useEffect(() => {
    if (workspace.status === "starting") {
      const booting = services.find((svc) => svc.status === "starting");
      if (booting) {
        setExpandedServiceName(booting.service_name);
      }
    } else if (workspace.status === "active") {
      setExpandedServiceName(null);
    }
  }, [workspace.status, services]);

  function renderServiceList(withLogs: boolean) {
    if (services.length === 0) {
      return null;
    }

    return (
      <div className="shrink-0">
        {services.map((svc) => (
          <ServiceRow
            expanded={withLogs ? expandedServiceName === svc.service_name : undefined}
            key={svc.id}
            logLines={withLogs ? serviceLogsByName.get(svc.service_name) : undefined}
            onStartService={(serviceName) => void handleRunService(serviceName)}
            onToggleExpanded={
              withLogs
                ? () =>
                    setExpandedServiceName((prev) =>
                      prev === svc.service_name ? null : svc.service_name,
                    )
                : undefined
            }
            onUpdateService={onUpdateService}
            runDisabled={!canStartService || activeServiceStartName !== null}
            runPending={activeServiceStartName === svc.service_name}
            runtime={serviceRuntimeByName[svc.service_name] ?? null}
            service={svc}
            statusAffordance="indicator"
          />
        ))}
      </div>
    );
  }

  function handleOpenServiceLogs(serviceName: string): void {
    setExpandedServiceName(expandedServiceName === serviceName ? null : serviceName);
  }

  async function handleRunService(serviceName: string): Promise<void> {
    if (!canStartService || activeServiceStartName !== null) {
      return;
    }

    setActionError(null);
    setActiveServiceStartName(serviceName);
    handleOpenServiceLogs(serviceName);

    try {
      await onRun([serviceName]);
    } catch (error) {
      setActionError(formatWorkspaceError(error, `Failed to start ${serviceName}.`));
    } finally {
      setActiveServiceStartName(null);
    }
  }

  // Derive workspace phase for layout decisions
  const isFailed = workspace.status === "idle" && workspace.failure_reason !== null;
  const isIdle = workspace.status === "idle" && workspace.failure_reason === null;
  const isBooting = workspace.status === "starting" || workspace.status === "stopping";
  const isActive = workspace.status === "active";

  const statusLabel = isBooting
    ? workspace.status === "starting"
      ? "Starting"
      : "Stopping"
    : isActive
      ? "Running"
      : isFailed
        ? "Failed"
        : "Idle";

  const statusDotClass = isActive
    ? "bg-[var(--status-success)]"
    : isBooting
      ? "bg-[var(--status-info)] lifecycle-motion-soft-pulse"
      : isFailed
        ? "bg-[var(--status-danger)]"
        : "bg-[var(--muted-foreground)]/40";

  // Idle with no manifest — nothing to show
  if (isIdle && !hasManifest) {
    return (
      <section className="relative flex h-full min-h-0 flex-col">
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            Add a{" "}
            <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-[11px]">
              lifecycle.json
            </code>{" "}
            to configure environment services and setup steps.
          </p>
        </div>
      </section>
    );
  }

  // Idle with manifest, ready to start — clean view
  if (isIdle && hasManifest) {
    return (
      <section className="relative flex h-full min-h-0 flex-col">
        {/* Boot sequence preview — collapsed, showing what will run */}
        {bootStepItems.length > 0 && (
          <div className="shrink-0 px-3 pt-1">
            <Collapsible onOpenChange={setBootExpanded} open={bootExpanded}>
              <CollapsibleTrigger asChild>
                <button
                  className="group flex w-full items-center gap-2 py-2 text-left"
                  type="button"
                >
                  <ChevronRight
                    className={`size-3 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150 ${bootExpanded ? "rotate-90" : ""}`}
                    strokeWidth={2.4}
                  />
                  <span className="text-[12px] font-medium text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]">
                    Environment
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]/60">
                    {bootStepItems.length} {bootStepItems.length === 1 ? "step" : "steps"}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pb-2 pt-0.5">
                  <BootSequence
                    config={config}
                    declaredStepNames={declaredSetupStepNames}
                    environmentTasks={environmentTasks}
                    items={bootStepItems}
                    onOpenServiceLogs={handleOpenServiceLogs}
                    onStartService={(serviceName) => void handleRunService(serviceName)}
                    onUpdateService={onUpdateService}
                    runDisabled={!canStartService || activeServiceStartName !== null}
                    runningServiceName={activeServiceStartName}
                    serviceRuntimeByName={serviceRuntimeByName}
                    services={services}
                    setupSteps={setupSteps}
                    workspace={workspace}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {renderServiceList(false)}

        {actionError && (
          <div className="px-3 pt-2">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Start button */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2.5 pb-2.5">
          <Button
            className="pointer-events-auto px-8"
            disabled={runButtonDisabled}
            onClick={() => void handleRunAction()}
            size="lg"
            variant="glass"
          >
            {runButtonLabel}
          </Button>
        </div>
      </section>
    );
  }

  // Failed — show failure prominently with option to see boot sequence
  if (isFailed) {
    return (
      <section className="relative flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block size-[7px] shrink-0 rounded-full ${statusDotClass}`} />
            <span className="text-[13px] font-medium text-[var(--foreground)]">{statusLabel}</span>
          </div>

          <div className="mt-2.5">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                {FAILURE_REASON_LABELS[workspace.failure_reason!] ?? workspace.failure_reason}
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Boot sequence details */}
          {bootStepItems.length > 0 && (
            <Collapsible
              className="shrink-0 px-3"
              onOpenChange={setBootExpanded}
              open={bootExpanded}
            >
              <CollapsibleTrigger asChild>
                <button
                  className="group flex w-full items-center gap-2 py-2 text-left"
                  type="button"
                >
                  <ChevronRight
                    className={`size-3 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150 ${bootExpanded ? "rotate-90" : ""}`}
                    strokeWidth={2.4}
                  />
                  <span className="text-[12px] font-medium text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]">
                    Setup
                  </span>
                  {bootPresentation && (
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]/60">
                      {bootPresentation.completedSteps}/{bootPresentation.totalSteps}
                    </span>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pb-2 pt-0.5">
                  <BootSequence
                    config={config}
                    declaredStepNames={declaredSetupStepNames}
                    environmentTasks={environmentTasks}
                    items={bootStepItems}
                    onOpenServiceLogs={handleOpenServiceLogs}
                    onStartService={(serviceName) => void handleRunService(serviceName)}
                    onUpdateService={onUpdateService}
                    runDisabled={!canStartService || activeServiceStartName !== null}
                    runningServiceName={activeServiceStartName}
                    serviceRuntimeByName={serviceRuntimeByName}
                    services={services}
                    setupSteps={setupSteps}
                    workspace={workspace}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {renderServiceList(true)}
        </div>

        {actionError && (
          <div className="px-3 pb-2">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Restart button */}
        {hasManifest && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2.5 pb-2.5">
            <Button
              className="pointer-events-auto px-8"
              disabled={runButtonDisabled}
              onClick={() => void handleRunAction()}
              size="lg"
              variant="glass"
            >
              {runButtonLabel}
            </Button>
          </div>
        )}
      </section>
    );
  }

  // Starting / Stopping / Active — full view with boot sequence and logs
  return (
    <section className="relative flex h-full min-h-0 flex-col">
      {/* Status header — only show during boot/stop, not when active */}
      {!isActive && (
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block size-[7px] shrink-0 rounded-full ${statusDotClass}`} />
            <span className="text-[13px] font-medium text-[var(--foreground)]">{statusLabel}</span>
          </div>
        </div>
      )}

      {/* Alerts — only contextual ones during active/booting */}
      {((isActive && isManifestStale) ||
        (isActive && manifestState === "invalid") ||
        actionError) && (
        <div className="shrink-0 px-3 pt-2 pb-1 flex flex-col gap-2">
          {isActive && isManifestStale && (
            <Alert>
              <AlertDescription>
                Manifest changed. Stop and start again to apply environment updates.
              </AlertDescription>
            </Alert>
          )}
          {isActive && manifestState === "invalid" && (
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
      )}

      {/* Scrollable body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Boot section */}
        {bootStepItems.length > 0 && (
          <Collapsible className="shrink-0 px-3" onOpenChange={setBootExpanded} open={bootExpanded}>
            <CollapsibleTrigger asChild>
              <button className="group flex w-full items-center gap-2 py-2 text-left" type="button">
                <ChevronRight
                  className={`size-3 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150 ${bootExpanded ? "rotate-90" : ""}`}
                  strokeWidth={2.4}
                />
                <span className="text-[12px] font-medium text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]">
                  Boot sequence
                </span>
                {bootPresentation && (
                  <div className="ml-auto flex items-center gap-2.5">
                    {bootPresentation.phase === "running" && (
                      <Spinner className="size-3 shrink-0 text-[var(--status-info)]" />
                    )}
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]/60">
                      {bootPresentation.completedSteps}/{bootPresentation.totalSteps}
                    </span>
                  </div>
                )}
              </button>
            </CollapsibleTrigger>
            {/* Progress bar */}
            {bootPresentation && (
              <div className="mb-1.5 h-[3px] overflow-hidden rounded-full bg-[var(--muted)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    bootPresentation.phase === "failed"
                      ? "bg-[var(--status-danger)]"
                      : bootPresentation.phase === "completed"
                        ? "bg-[var(--status-success)]"
                        : "bg-[var(--status-info)]"
                  }`}
                  style={{
                    width: `${bootPresentation.totalSteps > 0 ? (bootPresentation.completedSteps / bootPresentation.totalSteps) * 100 : 0}%`,
                  }}
                />
              </div>
            )}
            <CollapsibleContent>
              <div className="pb-2 pt-0.5">
                <BootSequence
                  config={config}
                  declaredStepNames={declaredSetupStepNames}
                  environmentTasks={environmentTasks}
                  items={bootStepItems}
                  onOpenServiceLogs={handleOpenServiceLogs}
                  onStartService={(serviceName) => void handleRunService(serviceName)}
                  onUpdateService={onUpdateService}
                  runDisabled={!canStartService || activeServiceStartName !== null}
                  runningServiceName={activeServiceStartName}
                  serviceRuntimeByName={serviceRuntimeByName}
                  services={services}
                  setupSteps={setupSteps}
                  workspace={workspace}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {renderServiceList(true)}
      </div>

      {/* Floating run action */}
      {hasManifest && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2.5 pb-2.5">
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              disabled={runButtonDisabled}
              onClick={() => void handleRunAction()}
              size="lg"
              variant="glass"
              className="px-8"
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

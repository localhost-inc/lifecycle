import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  Alert,
  AlertDescription,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
} from "@lifecycle/ui";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { BootSequence, deriveBootPresentation, deriveBootSequenceItems } from "./boot-sequence";
import { LogsTab } from "./logs-tab";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";
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
  setupSteps,
  services,
  workspace,
}: EnvironmentPanelProps) {
  const [activeAction, setActiveAction] = useState<"restart" | "start" | "stop" | null>(null);
  const [activeServiceStartName, setActiveServiceStartName] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restartMenuOpen, setRestartMenuOpen] = useState(false);
  const [selectedServiceLogsName, setSelectedServiceLogsName] = useState<string | null>(null);

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
  const serviceNames = Object.keys(serviceRuntimeByName);

  const canRun = workspace.status === "idle" && hasManifest;
  const canStartService =
    hasManifest && (workspace.status === "idle" || workspace.status === "active");
  const canStop = workspace.status === "active" || workspace.status === "starting";
  const canRestart = workspace.status === "active" && hasManifest;
  const stopping = workspace.status === "stopping";

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
  const bootPresentation = deriveBootPresentation(bootItems, workspace);

  // Auto-collapse boot card on terminal state, expand when booting
  const isTerminal =
    workspace.status === "active" ||
    (workspace.status === "idle" && workspace.failure_reason !== null);
  const [bootExpanded, setBootExpanded] = useState(!isTerminal);
  useEffect(() => {
    setBootExpanded(!isTerminal);
  }, [isTerminal]);

  function handleOpenServiceLogs(serviceName: string): void {
    setSelectedServiceLogsName(serviceName);
  }

  async function handleRunService(serviceName: string): Promise<void> {
    if (!canStartService || activeAction !== null || activeServiceStartName !== null) {
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

  async function handleStart(): Promise<void> {
    if (!canRun || activeAction !== null || activeServiceStartName !== null) {
      return;
    }

    setActionError(null);
    setActiveAction("start");

    try {
      await onRun();
    } catch (error) {
      setActionError(formatWorkspaceError(error, "Failed to start workspace."));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleStop(): Promise<void> {
    if (!canStop || activeAction !== null) {
      return;
    }

    setActionError(null);
    setActiveAction("stop");

    try {
      await onStop();
    } catch (error) {
      setActionError(formatWorkspaceError(error, "Failed to stop workspace."));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleRestart(): Promise<void> {
    if (!canRestart || activeAction !== null) {
      return;
    }

    setActionError(null);
    setActiveAction("restart");
    setRestartMenuOpen(false);

    try {
      await onRestart();
    } catch (error) {
      setActionError(formatWorkspaceError(error, "Failed to restart workspace."));
    } finally {
      setActiveAction(null);
    }
  }

  const actionConfig =
    workspace.status === "starting"
      ? {
          icon: <Spinner className="size-3.5" />,
          label: "Starting...",
          onClick: handleStop,
          title: "Stop workspace services",
          variant: "secondary" as const,
        }
      : canStop || stopping
        ? {
            icon: <Square className="size-3.5 fill-current" strokeWidth={2.2} />,
            label: activeAction === "stop" || stopping ? "Stopping..." : "Stop",
            onClick: handleStop,
            title: "Stop workspace services",
            variant: "secondary" as const,
          }
        : {
            icon: <Play className="size-3.5 fill-current" strokeWidth={2.2} />,
            label: activeAction === "start" ? "Starting..." : "Start",
            onClick: handleStart,
            title: "Start workspace environment",
            variant: "default" as const,
          };

  const actionDisabled =
    activeAction !== null || activeServiceStartName !== null || stopping || (!canRun && !canStop);

  const statusLabel =
    workspace.status === "starting"
      ? "Starting"
      : workspace.status === "stopping"
        ? "Stopping"
        : workspace.status === "active"
          ? "Running"
          : workspace.failure_reason
            ? "Failed"
            : "Idle";

  const statusDotClass =
    workspace.status === "active"
      ? "bg-[var(--status-success)]"
      : workspace.status === "starting"
        ? "bg-[var(--status-info)] lifecycle-motion-soft-pulse"
        : workspace.failure_reason
          ? "bg-[var(--status-danger)]"
          : "bg-[var(--muted-foreground)]/40";

  return (
    <section className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block size-[7px] shrink-0 rounded-full ${statusDotClass}`} />
            <span className="text-[13px] font-medium text-[var(--foreground)]">
              {statusLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center">
            {canRestart ? (
              <SplitButton>
                <SplitButtonPrimary
                  disabled={actionDisabled}
                  leadingIcon={<Square className="size-3 fill-current" strokeWidth={2.2} />}
                  onClick={() => void handleStop()}
                  title="Stop workspace services"
                  variant="foreground"
                >
                  {activeAction === "stop" || stopping ? "Stopping..." : "Stop"}
                </SplitButtonPrimary>
                <Popover onOpenChange={setRestartMenuOpen} open={restartMenuOpen}>
                  <PopoverTrigger asChild>
                    <SplitButtonSecondary
                      aria-label="Show environment actions"
                      disabled={actionDisabled}
                      title="More environment actions"
                    >
                      <ChevronDown className="size-3.5" strokeWidth={2.4} />
                    </SplitButtonSecondary>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-44 rounded-lg border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
                    side="bottom"
                    sideOffset={8}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={activeAction !== null}
                      onClick={() => void handleRestart()}
                    >
                      <RotateCcw className="size-3.5" strokeWidth={2.2} />
                      <span>{activeAction === "restart" ? "Restarting..." : "Restart"}</span>
                    </button>
                  </PopoverContent>
                </Popover>
              </SplitButton>
            ) : (
              <Button
                disabled={actionDisabled}
                onClick={() => void actionConfig.onClick()}
                size="sm"
                title={actionConfig.title}
                variant={actionConfig.variant}
              >
                {actionConfig.icon}
                <span>{actionConfig.label}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Alerts */}
        {(actionError ||
          (workspace.status === "idle" && workspace.failure_reason) ||
          (workspace.status === "active" && isManifestStale) ||
          (workspace.status === "active" && manifestState === "invalid")) && (
          <div className="mt-2.5 flex flex-col gap-2">
            {workspace.status === "idle" && workspace.failure_reason && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  {FAILURE_REASON_LABELS[workspace.failure_reason] ?? workspace.failure_reason}
                </AlertDescription>
              </Alert>
            )}
            {workspace.status === "active" && isManifestStale && (
              <Alert>
                <AlertDescription>
                  Manifest changed. Stop and start again to apply environment updates.
                </AlertDescription>
              </Alert>
            )}
            {workspace.status === "active" && manifestState === "invalid" && (
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
      </div>

      {/* Scrollable body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Boot section */}
        {bootItems.length > 0 && (
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
                <span className="text-[12px] font-medium text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] transition-colors">
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
                  onOpenServiceLogs={handleOpenServiceLogs}
                  onStartService={(serviceName) => void handleRunService(serviceName)}
                  onUpdateService={onUpdateService}
                  runDisabled={
                    !canStartService || activeAction !== null || activeServiceStartName !== null
                  }
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

        {/* Divider */}
        {bootItems.length > 0 && <div className="mx-3 border-t border-[var(--border)]" />}

        {/* Logs section */}
        <div className="shrink-0 px-3 pt-3">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-medium text-[var(--muted-foreground)]">
              Logs
            </span>
            {serviceNames.length > 0 && (
              <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-0.5">
                <button
                  className={`rounded-[5px] px-2.5 py-1 text-[11px] transition-colors ${
                    selectedServiceLogsName === null
                      ? "bg-[var(--surface)] font-medium text-[var(--foreground)] shadow-xs"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  onClick={() => setSelectedServiceLogsName(null)}
                  type="button"
                >
                  All
                </button>
                {serviceNames.map((name) => (
                  <button
                    className={`rounded-[5px] px-2.5 py-1 text-[11px] transition-colors ${
                      selectedServiceLogsName === name
                        ? "bg-[var(--surface)] font-medium text-[var(--foreground)] shadow-xs"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    }`}
                    key={name}
                    onClick={() =>
                      setSelectedServiceLogsName(selectedServiceLogsName === name ? null : name)
                    }
                    type="button"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Log entries */}
        <div className="mt-2 flex min-h-0 flex-1 flex-col px-3 pb-4">
          <LogsTab
            config={config}
            declaredStepNames={declaredSetupStepNames}
            environmentTasks={environmentTasks}
            selectedServiceName={selectedServiceLogsName}
            serviceRuntimeByName={serviceRuntimeByName}
            setupSteps={setupSteps}
            workspace={workspace}
          />
        </div>
      </div>
    </section>
  );
}

import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@lifecycle/ui";
import { useState } from "react";
import { ChevronDown, LoaderCircle, Play, RotateCcw, Square } from "lucide-react";
import { GraphTab } from "./graph-tab";
import { LogsTab } from "./logs-tab";
import { OverviewTab } from "./overview-tab";
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

const ENVIRONMENT_PANEL_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Topology", value: "topology" },
  { label: "Logs", value: "logs" },
] as const;

export type EnvironmentPanelTabValue = (typeof ENVIRONMENT_PANEL_TABS)[number]["value"];

export function isEnvironmentPanelTabValue(
  value: string | null | undefined,
): value is EnvironmentPanelTabValue {
  return ENVIRONMENT_PANEL_TABS.some((tab) => tab.value === value);
}

interface EnvironmentPanelProps {
  activeTab?: EnvironmentPanelTabValue;
  config: LifecycleConfig | null;
  hasManifest: boolean;
  isManifestStale: boolean;
  manifestState: "invalid" | "missing" | "valid";
  onActiveTabChange?: (tab: EnvironmentPanelTabValue) => void;
  onRestart: () => Promise<void>;
  onRun: () => Promise<void>;
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
  activeTab: controlledActiveTab,
  config,
  hasManifest,
  isManifestStale,
  manifestState,
  onActiveTabChange,
  onRestart,
  onRun,
  onStop,
  onUpdateService,
  environmentTasks,
  setupSteps,
  services,
  workspace,
}: EnvironmentPanelProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] =
    useState<EnvironmentPanelTabValue>("overview");
  const [activeAction, setActiveAction] = useState<"restart" | "start" | "stop" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restartMenuOpen, setRestartMenuOpen] = useState(false);
  const activeTab = controlledActiveTab ?? uncontrolledActiveTab;
  const handleActiveTabChange = (tab: EnvironmentPanelTabValue) => {
    onActiveTabChange?.(tab);
    if (controlledActiveTab === undefined) {
      setUncontrolledActiveTab(tab);
    }
  };
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
  const canRun = workspace.status === "idle" && hasManifest;
  const canStop = workspace.status === "active" || workspace.status === "starting";
  const canRestart = workspace.status === "active" && hasManifest;
  const stopping = workspace.status === "stopping";
  async function handleStart(): Promise<void> {
    if (!canRun || activeAction !== null) {
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
          icon: <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />,
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

  const actionDisabled = activeAction !== null || stopping || (!canRun && !canStop);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="px-2.5 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="app-panel-title">Environment</span>
            </div>
            <div className="flex shrink-0 items-center">
              {canRestart ? (
                <SplitButton>
                  <SplitButtonPrimary
                    disabled={actionDisabled}
                    leadingIcon={<Square className="size-3.5 fill-current" strokeWidth={2.2} />}
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
                      className="w-44 rounded-lg border-[var(--border)] bg-[var(--panel)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
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
          {workspace.status === "idle" && workspace.failure_reason && (
            <p className="text-xs text-[var(--destructive)]">
              {FAILURE_REASON_LABELS[workspace.failure_reason] ?? workspace.failure_reason}
            </p>
          )}
          {workspace.status === "active" && isManifestStale && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Manifest changed. Stop and start again to apply environment updates.
            </p>
          )}
          {workspace.status === "active" && manifestState === "invalid" && (
            <p className="text-xs text-[var(--destructive)]">
              lifecycle.json is invalid. Current services keep running until you stop them.
            </p>
          )}
          {actionError && <p className="text-xs text-[var(--destructive)]">{actionError}</p>}
          <Tabs
            onValueChange={(value) => handleActiveTabChange(value as EnvironmentPanelTabValue)}
            value={activeTab}
          >
            <TabsList className="-mx-2.5 w-[calc(100%+1.25rem)]" variant="underline">
              {ENVIRONMENT_PANEL_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} variant="underline">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-4 pt-1">
          {activeTab === "overview" && (
            <OverviewTab
              config={config}
              declaredStepNames={declaredSetupStepNames}
              environmentTasks={environmentTasks}
              onUpdateService={onUpdateService}
              serviceRuntimeByName={serviceRuntimeByName}
              services={services}
              setupSteps={setupSteps}
              workspace={workspace}
            />
          )}
          {activeTab === "topology" && <GraphTab config={config} services={services} />}
          {activeTab === "logs" && <LogsTab />}
        </div>
      </div>
    </section>
  );
}

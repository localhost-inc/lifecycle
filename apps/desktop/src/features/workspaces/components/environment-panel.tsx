import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { SetupProgress, Tabs, TabsList, TabsTrigger, cn } from "@lifecycle/ui";
import { useState } from "react";
import { Play, Square } from "lucide-react";
import { LogsTab } from "./logs-tab";
import { ServicesTab } from "./services-tab";
import type { SetupStepState } from "../hooks";

const ENVIRONMENT_PANEL_TABS = [
  { label: "Services", value: "services" },
  { label: "Logs", value: "logs" },
] as const;

type EnvironmentPanelTabValue = (typeof ENVIRONMENT_PANEL_TABS)[number]["value"];

interface EnvironmentPanelProps {
  hasManifest: boolean;
  isManifestStale: boolean;
  manifestState: "invalid" | "missing" | "valid";
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  setupSteps: SetupStepState[];
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}

export function EnvironmentPanel({
  hasManifest,
  isManifestStale,
  manifestState,
  onRun,
  onStop,
  onUpdateService,
  setupSteps,
  services,
  workspace,
}: EnvironmentPanelProps) {
  const [activeTab, setActiveTab] = useState<EnvironmentPanelTabValue>("services");
  const [activeAction, setActiveAction] = useState<"run" | "stop" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canRun = workspace.status === "idle" && hasManifest;
  const canStop = workspace.status === "active" || workspace.status === "starting";
  const stopping = workspace.status === "stopping";
  const showSetupProgress =
    setupSteps.length > 0 &&
    (workspace.status === "starting" ||
      (workspace.status === "idle" && workspace.failure_reason !== null));

  async function handleRun(): Promise<void> {
    if (!canRun || activeAction !== null) {
      return;
    }

    setActionError(null);
    setActiveAction("run");

    try {
      await onRun();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
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
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActiveAction(null);
    }
  }

  const actionConfig =
    canStop || stopping
      ? {
          icon: <Square className="size-3.5 fill-current" strokeWidth={2.2} />,
          label: activeAction === "stop" || stopping ? "Stopping..." : "Stop",
          onClick: handleStop,
          title: "Stop workspace services",
          toneClassName: "compact-control-tone-foreground",
        }
      : {
          icon: <Play className="size-3.5 fill-current" strokeWidth={2.2} />,
          label: activeAction === "run" ? "Running..." : "Run",
          onClick: handleRun,
          title: "Run workspace services",
          toneClassName: "compact-control-tone-active",
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
              <button
                className={cn(
                  "compact-control-standalone compact-control-item compact-control-label px-3",
                  actionConfig.toneClassName,
                )}
                disabled={actionDisabled}
                onClick={() => void actionConfig.onClick()}
                title={actionConfig.title}
                type="button"
              >
                {actionConfig.icon}
                <span>{actionConfig.label}</span>
              </button>
            </div>
          </div>
          {workspace.status === "idle" && workspace.failure_reason && (
            <p className="text-xs text-[var(--destructive)]">{workspace.failure_reason}</p>
          )}
          {manifestState === "missing" && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Add a lifecycle.json file to the project root to configure services and setup steps.
            </p>
          )}
          {workspace.status === "active" && isManifestStale && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Manifest changed. Stop and run again to apply service updates.
            </p>
          )}
          {workspace.status === "active" && manifestState === "invalid" && (
            <p className="text-xs text-[var(--destructive)]">
              lifecycle.json is invalid. Current services keep running until you stop them.
            </p>
          )}
          {actionError && <p className="text-xs text-[var(--destructive)]">{actionError}</p>}
          {showSetupProgress && <SetupProgress steps={setupSteps} />}
          <Tabs
            onValueChange={(value) => setActiveTab(value as EnvironmentPanelTabValue)}
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
          {activeTab === "services" && (
            <ServicesTab
              manifestState={manifestState}
              onUpdateService={onUpdateService}
              services={services}
            />
          )}
          {activeTab === "logs" && <LogsTab />}
        </div>
      </div>
    </section>
  );
}

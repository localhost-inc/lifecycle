import type { ServiceRecord, WorkspaceRecord, WorkspaceStatus } from "@lifecycle/contracts";
import { Badge, Tabs, TabsList, TabsTrigger, cn } from "@lifecycle/ui";
import { useState } from "react";
import { Play, Square } from "lucide-react";
import { LogsTab } from "./logs-tab";
import { ServicesTab } from "./services-tab";

const statusBadgeVariant: Record<
  WorkspaceStatus,
  "destructive" | "info" | "muted" | "success" | "warning"
> = {
  creating: "info",
  destroying: "warning",
  failed: "destructive",
  ready: "success",
  resetting: "info",
  sleeping: "muted",
  starting: "info",
};

const statusLabel: Record<WorkspaceStatus, string> = {
  creating: "Creating",
  destroying: "Destroying",
  failed: "Failed",
  ready: "Ready",
  resetting: "Resetting",
  sleeping: "Sleeping",
  starting: "Starting",
};

const ENVIRONMENT_PANEL_TABS = [
  { label: "Services", value: "services" },
  { label: "Logs", value: "logs" },
] as const;

type EnvironmentPanelTabValue = (typeof ENVIRONMENT_PANEL_TABS)[number]["value"];

interface EnvironmentPanelProps {
  hasManifest: boolean;
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}

export function EnvironmentPanel({
  hasManifest,
  onRun,
  onStop,
  services,
  workspace,
}: EnvironmentPanelProps) {
  const [activeTab, setActiveTab] = useState<EnvironmentPanelTabValue>("services");
  const [activeAction, setActiveAction] = useState<"run" | "stop" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const readyCount = services.filter((service) => service.status === "ready").length;
  const canRun = (workspace.status === "sleeping" || workspace.status === "failed") && hasManifest;
  const canStop = workspace.status === "ready";

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
    workspace.status === "ready"
      ? {
          icon: <Square className="size-3.5 fill-current" strokeWidth={2.2} />,
          label: activeAction === "stop" ? "Stopping..." : "Stop",
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

  const actionDisabled = activeAction !== null || (!canRun && !canStop);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="px-2.5 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="app-panel-title">Environment</span>
                {workspace.status !== "sleeping" && (
                  <Badge
                    className="uppercase tracking-[0.14em]"
                    variant={statusBadgeVariant[workspace.status]}
                  >
                    {statusLabel[workspace.status]}
                  </Badge>
                )}
                {services.length > 0 && (
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    {readyCount}/{services.length} ready
                  </span>
                )}
              </div>
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
          {workspace.status === "failed" && workspace.failure_reason && (
            <p className="text-xs text-[var(--destructive)]">{workspace.failure_reason}</p>
          )}
          {actionError && <p className="text-xs text-[var(--destructive)]">{actionError}</p>}
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
            <ServicesTab hasManifest={hasManifest} services={services} />
          )}
          {activeTab === "logs" && <LogsTab />}
        </div>
      </div>
    </section>
  );
}

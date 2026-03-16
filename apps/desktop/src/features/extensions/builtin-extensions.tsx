import type {
  GitStatusResult,
  LifecycleConfig,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { GitBranch, History, Logs, Server } from "lucide-react";
import type {
  ExtensionBadge,
  ExtensionSlot,
  WorkspaceExtensionId,
  WorkspaceExtensionLaunchActions,
} from "./extension-bar-types";
import { EnvironmentPanel } from "../workspaces/components/environment-panel";
import { LogsTab } from "../workspaces/components/logs-tab";
import type { EnvironmentTaskState, SetupStepState } from "../workspaces/hooks";
import { GitChangesPanel } from "../git/components/git-changes-panel";
import { GitHistoryPanel } from "../git/components/git-history-panel";

export function getGitExtensionBadge(
  gitStatus: GitStatusResult | undefined,
): ExtensionBadge | null {
  const changedFileCount = gitStatus?.files.length ?? 0;
  return changedFileCount > 0 ? { kind: "dot", tone: "warning" } : null;
}

export function getEnvironmentExtensionBadge({
  services,
  workspace,
}: {
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}): ExtensionBadge {
  const hasFailedService = services.some(
    (service) => service.status === "failed" || service.preview_status === "failed",
  );
  const hasTransitionalService = services.some(
    (service) => service.status === "starting" || service.preview_status === "provisioning",
  );

  const tone =
    workspace.failure_reason !== null || hasFailedService
      ? "danger"
      : workspace.status === "starting" || workspace.status === "stopping" || hasTransitionalService
        ? "warning"
        : workspace.status === "active"
          ? "success"
          : "neutral";

  return { kind: "dot", tone };
}

interface BuiltinExtensionsOptions {
  config: LifecycleConfig | null;
  environmentTasks: EnvironmentTaskState[];
  gitStatus: GitStatusResult | undefined;
  hasManifest: boolean;
  isManifestStale: boolean;
  launchActions: WorkspaceExtensionLaunchActions;
  manifestState: "invalid" | "missing" | "valid";
  onClearServiceLogsName: () => void;
  onOpenServiceLogs: (serviceName: string) => void;
  onRestart: () => Promise<void>;
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  onSwitchToExtension: (id: WorkspaceExtensionId) => void;
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  selectedServiceLogsName: string | null;
  services: ServiceRecord[];
  setupSteps: SetupStepState[];
  workspace: WorkspaceRecord;
}

export function getBuiltinExtensionSlots({
  config,
  environmentTasks,
  gitStatus,
  hasManifest,
  isManifestStale,
  launchActions,
  manifestState,
  onClearServiceLogsName,
  onOpenServiceLogs,
  onRestart,
  onRun,
  onStop,
  onSwitchToExtension,
  onUpdateService,
  selectedServiceLogsName,
  services,
  setupSteps,
  workspace,
}: BuiltinExtensionsOptions): ExtensionSlot[] {
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

  return [
    {
      badge: getGitExtensionBadge(gitStatus),
      icon: GitBranch,
      id: "git-changes",
      label: "Changes",
      panel: (
        <GitChangesPanel
          onCommitComplete={() => onSwitchToExtension("git-history")}
          onOpenDiff={launchActions.openChangesDiff}
          onOpenFile={launchActions.openFileViewer}
          onOpenPullRequest={launchActions.openPullRequest}
          onShowChanges={() => onSwitchToExtension("git-changes")}
          workspaceId={workspace.id}
          workspaceMode={workspace.mode}
          worktreePath={workspace.worktree_path}
        />
      ),
    },
    {
      icon: History,
      id: "git-history",
      label: "History",
      ownedDocumentKinds: ["commit-diff"],
      panel: (
        <GitHistoryPanel
          onOpenCommitDiff={launchActions.openCommitDiff}
          workspaceId={workspace.id}
          workspaceMode={workspace.mode}
          worktreePath={workspace.worktree_path}
        />
      ),
    },
    {
      badge: getEnvironmentExtensionBadge({ services, workspace }),
      icon: Server,
      id: "environment",
      label: "Environment",
      panel: (
        <EnvironmentPanel
          config={config}
          environmentTasks={environmentTasks}
          hasManifest={hasManifest}
          isManifestStale={isManifestStale}
          manifestState={manifestState}
          onOpenServiceLogs={onOpenServiceLogs}
          onRestart={onRestart}
          onRun={onRun}
          onStop={onStop}
          onUpdateService={onUpdateService}
          services={services}
          setupSteps={setupSteps}
          workspace={workspace}
        />
      ),
    },
    {
      icon: Logs,
      id: "logs",
      label: "Logs",
      panel: (
        <section className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-3">
            <LogsTab
              config={config}
              declaredStepNames={declaredSetupStepNames}
              environmentTasks={environmentTasks}
              onClearSelectedService={onClearServiceLogsName}
              selectedServiceName={selectedServiceLogsName}
              serviceRuntimeByName={serviceRuntimeByName}
              services={services}
              setupSteps={setupSteps}
              workspace={workspace}
            />
          </div>
        </section>
      ),
    },
  ];
}

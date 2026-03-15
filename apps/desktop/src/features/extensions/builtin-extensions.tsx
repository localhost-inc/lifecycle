import type {
  GitStatusResult,
  LifecycleConfig,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { GitBranch, Server } from "lucide-react";
import type {
  ExtensionBadge,
  ExtensionSlot,
  WorkspaceExtensionLaunchActions,
} from "./extension-bar-types";
import {
  EnvironmentPanel,
  type EnvironmentPanelTabValue,
} from "../workspaces/components/environment-panel";
import type { EnvironmentTaskState, SetupStepState } from "../workspaces/hooks";
import { GitPanel, type GitPanelTabValue } from "../git/components/git-panel";

export function getGitExtensionBadge(
  gitStatus: GitStatusResult | undefined,
): ExtensionBadge | null {
  const changedFileCount = gitStatus?.files.length ?? 0;
  return changedFileCount > 0 ? { kind: "count", value: changedFileCount } : null;
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
  activeEnvironmentTab: EnvironmentPanelTabValue;
  activeGitTab: GitPanelTabValue;
  config: LifecycleConfig | null;
  environmentTasks: EnvironmentTaskState[];
  gitStatus: GitStatusResult | undefined;
  hasManifest: boolean;
  isManifestStale: boolean;
  launchActions: WorkspaceExtensionLaunchActions;
  manifestState: "invalid" | "missing" | "valid";
  onActiveEnvironmentTabChange: (tab: EnvironmentPanelTabValue) => void;
  onActiveGitTabChange: (tab: GitPanelTabValue) => void;
  onRestart: () => Promise<void>;
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  services: ServiceRecord[];
  setupSteps: SetupStepState[];
  workspace: WorkspaceRecord;
}

export function getBuiltinExtensionSlots({
  activeEnvironmentTab,
  activeGitTab,
  config,
  environmentTasks,
  gitStatus,
  hasManifest,
  isManifestStale,
  launchActions,
  manifestState,
  onActiveEnvironmentTabChange,
  onActiveGitTabChange,
  onRestart,
  onRun,
  onStop,
  onUpdateService,
  services,
  setupSteps,
  workspace,
}: BuiltinExtensionsOptions): ExtensionSlot[] {
  return [
    {
      badge: getGitExtensionBadge(gitStatus),
      icon: GitBranch,
      id: "git",
      label: "Git",
      ownedDocumentKinds: ["changes-diff", "commit-diff"],
      panel: (
        <GitPanel
          activeTab={activeGitTab}
          onActiveTabChange={onActiveGitTabChange}
          onOpenCommitDiff={launchActions.openCommitDiff}
          onOpenDiff={launchActions.openChangesDiff}
          onOpenFile={launchActions.openFileViewer}
          onOpenPullRequest={launchActions.openPullRequest}
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
          activeTab={activeEnvironmentTab}
          config={config}
          environmentTasks={environmentTasks}
          hasManifest={hasManifest}
          isManifestStale={isManifestStale}
          manifestState={manifestState}
          onActiveTabChange={onActiveEnvironmentTabChange}
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
  ];
}

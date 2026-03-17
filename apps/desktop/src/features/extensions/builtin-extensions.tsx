import type {
  GitStatusResult,
  LifecycleConfig,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { FileDiff, GitCommitHorizontal, GitPullRequest, Layers, TerminalSquare } from "lucide-react";
import type {
  ExtensionBadge,
  ExtensionSlot,
  WorkspaceExtensionId,
  WorkspaceExtensionLaunchActions,
} from "./extension-bar-types";
import { EnvironmentPanel } from "../workspaces/components/environment-panel";
import type { EnvironmentTaskState, SetupStepState } from "../workspaces/hooks";
import { GitChangesPanel } from "../git/components/git-changes-panel";
import { GitHistoryPanel } from "../git/components/git-history-panel";
import { GitPullRequestsPanel } from "../git/components/git-pull-requests-panel";
import { SessionHistoryPanel } from "../terminals/components/session-history-panel";

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
  onFocusTerminal: (terminalId: string) => void;
  onRestart: () => Promise<void>;
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  onSwitchToExtension: (id: WorkspaceExtensionId) => void;
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
  config,
  environmentTasks,
  gitStatus,
  hasManifest,
  isManifestStale,
  launchActions,
  manifestState,
  onFocusTerminal,
  onRestart,
  onRun,
  onStop,
  onSwitchToExtension,
  onUpdateService,
  services,
  setupSteps,
  workspace,
}: BuiltinExtensionsOptions): ExtensionSlot[] {
  return [
    {
      badge: getGitExtensionBadge(gitStatus),
      icon: FileDiff,
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
      icon: GitCommitHorizontal,
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
      icon: GitPullRequest,
      id: "pull-requests",
      label: "Pull Requests",
      panel: (
        <GitPullRequestsPanel
          onOpenPullRequest={launchActions.openPullRequest}
          workspaceId={workspace.id}
          workspaceMode={workspace.mode}
          worktreePath={workspace.worktree_path}
        />
      ),
    },
    {
      icon: TerminalSquare,
      id: "session-history",
      label: "Sessions",
      panel: (
        <SessionHistoryPanel
          onFocusTerminal={onFocusTerminal}
          workspaceId={workspace.id}
        />
      ),
    },
    {
      badge: getEnvironmentExtensionBadge({ services, workspace }),
      icon: Layers,
      id: "environment",
      label: "Environment",
      panel: (
        <EnvironmentPanel
          config={config}
          environmentTasks={environmentTasks}
          hasManifest={hasManifest}
          isManifestStale={isManifestStale}
          manifestState={manifestState}
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

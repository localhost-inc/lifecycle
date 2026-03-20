import type {
  EnvironmentRecord,
  GitStatusResult,
  LifecycleConfig,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import {
  FileDiff,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  TerminalSquare,
} from "lucide-react";
import { lazy } from "react";
import type {
  ExtensionBadge,
  ExtensionSlot,
  WorkspaceExtensionId,
  WorkspaceExtensionLaunchActions,
} from "@/features/extensions/extension-bar-types";

const GitChangesPanel = lazy(async () => {
  const module = await import("../git/components/git-changes-panel");
  return { default: module.GitChangesPanel };
});

const GitHistoryPanel = lazy(async () => {
  const module = await import("../git/components/git-history-panel");
  return { default: module.GitHistoryPanel };
});

const GitPullRequestsPanel = lazy(async () => {
  const module = await import("../git/components/git-pull-requests-panel");
  return { default: module.GitPullRequestsPanel };
});

const SessionHistoryPanel = lazy(async () => {
  const module = await import("../terminals/components/session-history-panel");
  return { default: module.SessionHistoryPanel };
});

const EnvironmentPanel = lazy(async () => {
  const module = await import("../workspaces/components/environment-panel");
  return { default: module.EnvironmentPanel };
});

export function getGitExtensionBadge(
  gitStatus: GitStatusResult | undefined,
): ExtensionBadge | null {
  const changedFileCount = gitStatus?.files.length ?? 0;
  return changedFileCount > 0 ? { kind: "dot", tone: "warning" } : null;
}

export function getEnvironmentExtensionBadge({
  environment,
  services,
}: {
  environment: EnvironmentRecord;
  services: ServiceRecord[];
}): ExtensionBadge {
  const hasFailedService = services.some((service) => service.status === "failed");
  const hasTransitionalService = services.some((service) => service.status === "starting");
  const hasFailedEnvironment = environment.failure_reason !== null;

  const tone =
    hasFailedEnvironment || hasFailedService
      ? "danger"
      : environment.status === "starting" ||
          environment.status === "stopping" ||
          hasTransitionalService
        ? "warning"
        : environment.status === "running"
          ? "success"
          : "neutral";

  return { kind: "dot", tone };
}

interface BuiltinExtensionsOptions {
  config: LifecycleConfig | null;
  environment: EnvironmentRecord;
  gitStatus: GitStatusResult | undefined;
  hasManifest: boolean;
  launchActions: WorkspaceExtensionLaunchActions;
  manifestState: "invalid" | "missing" | "valid";
  onFocusTerminal: (terminalId: string) => void;
  onRestart: () => Promise<void>;
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  onSwitchToExtension: (id: WorkspaceExtensionId) => void;
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}

export function getBuiltinExtensionSlots({
  config,
  environment,
  gitStatus,
  hasManifest,
  launchActions,
  manifestState,
  onFocusTerminal,
  onRestart,
  onRun,
  onStop,
  onSwitchToExtension,
  services,
  workspace,
}: BuiltinExtensionsOptions): ExtensionSlot[] {
  const slots: ExtensionSlot[] = [
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
      panel: <SessionHistoryPanel onFocusTerminal={onFocusTerminal} workspaceId={workspace.id} />,
    },
  ];

  slots.push({
    badge: getEnvironmentExtensionBadge({ environment, services }),
    icon: Layers,
    id: "environment",
    label: "Environment",
    panel: (
      <EnvironmentPanel
        config={config}
        environment={environment}
        hasManifest={hasManifest}
        manifestState={manifestState}
        onRestart={onRestart}
        onRun={onRun}
        onStop={onStop}
        services={services}
        workspace={workspace}
      />
    ),
  });

  return slots;
}

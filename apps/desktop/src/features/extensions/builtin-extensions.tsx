import type {
  GitStatusResult,
  LifecycleConfig,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import {
  FileDiff,
  FolderOpen,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  BotMessageSquare,
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

const AgentSessionsPanel = lazy(async () => {
  const module = await import("../agents/components/session-history-panel");
  return { default: module.SessionHistoryPanel };
});

const ExplorerPanel = lazy(async () => {
  const module = await import("../explorer/components/explorer-panel");
  return { default: module.ExplorerPanel };
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
  workspace,
  services,
}: {
  workspace: Pick<WorkspaceRecord, "status" | "failure_reason">;
  services: ServiceRecord[];
}): ExtensionBadge {
  const hasFailedService = services.some((service) => service.status === "failed");
  const hasTransitionalService = services.some((service) => service.status === "starting");
  const hasReadyService = services.some((service) => service.status === "ready");
  const hasFailedEnvironment = workspace.failure_reason !== null;

  const tone =
    hasFailedEnvironment || hasFailedService
      ? "danger"
      : workspace.status === "provisioning" ||
          workspace.status === "archiving" ||
          hasTransitionalService
        ? "warning"
        : workspace.status === "active" && hasReadyService
          ? "success"
          : "neutral";

  return { kind: "dot", tone };
}

interface BuiltinExtensionsOptions {
  config: LifecycleConfig | null;
  gitStatus: GitStatusResult | undefined;
  hasManifest: boolean;
  launchActions: WorkspaceExtensionLaunchActions;
  manifestState: "invalid" | "missing" | "valid";
  onRun: () => Promise<void>;
  onSwitchToExtension: (id: WorkspaceExtensionId) => void;
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}

export function getBuiltinExtensionSlots({
  config,
  gitStatus,
  hasManifest,
  launchActions,
  manifestState,
  onRun,
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
          workspaceTarget={workspace.target}
          worktreePath={workspace.worktree_path}
        />
      ),
    },
    {
      icon: FolderOpen,
      id: "explorer",
      label: "Explorer",
      panel: (
        <ExplorerPanel
          onOpenFile={launchActions.openFileViewer}
          workspaceId={workspace.id}
          workspaceTarget={workspace.target}
          worktreePath={workspace.worktree_path}
        />
      ),
    },
    {
      icon: GitCommitHorizontal,
      id: "git-history",
      label: "History",
      ownedSurfaceKinds: ["commit-diff"],
      panel: (
        <GitHistoryPanel
          onOpenCommitDiff={launchActions.openCommitDiff}
          workspaceId={workspace.id}
          workspaceTarget={workspace.target}
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
          workspaceTarget={workspace.target}
          worktreePath={workspace.worktree_path}
        />
      ),
    },
    {
      icon: BotMessageSquare,
      id: "session-history",
      label: "Agents",
      panel: (
        <AgentSessionsPanel
          onOpenAgentSession={launchActions.openAgentSession}
          workspaceId={workspace.id}
        />
      ),
    },
  ];

  slots.push({
    badge: getEnvironmentExtensionBadge({ workspace, services }),
    icon: Layers,
    id: "environment",
    label: "Environment",
    panel: (
      <EnvironmentPanel
        config={config}
        hasManifest={hasManifest}
        manifestState={manifestState}
        onOpenPreview={launchActions.openPreview}
        onRun={onRun}
        services={services}
        workspace={workspace}
      />
    ),
  });

  return slots;
}

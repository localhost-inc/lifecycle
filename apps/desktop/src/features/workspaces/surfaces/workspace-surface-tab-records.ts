import type {
  AgentSessionProviderId,
  GitLogEntry,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import {
  normalizeWorkspaceFilePath,
  workspaceFileBasename,
  workspaceFileExtension,
} from "@/features/workspaces/lib/workspace-file-paths";

export interface ChangesDiffTab {
  focusPath: string | null;
  key: string;
  kind: "changes-diff";
  label: "Workspace Diff";
}

export interface CommitDiffTab extends GitLogEntry {
  key: string;
  kind: "commit-diff";
  label: string;
}

export interface PullRequestTab extends GitPullRequestSummary {
  key: string;
  kind: "pull-request";
  label: string;
}

export interface FileEditorTab {
  extension: string | null;
  filePath: string;
  key: string;
  kind: "file-editor";
  label: string;
}

export interface PreviewTab {
  key: string;
  kind: "preview";
  label: string;
  url: string;
}

export interface AgentTab {
  agentSessionId: string;
  provider: AgentSessionProviderId;
  key: string;
  kind: "agent";
  label: string;
  responseReady?: boolean;
  running?: boolean;
}

export type WorkspaceCanvasTab =
  | AgentTab
  | ChangesDiffTab
  | CommitDiffTab
  | FileEditorTab
  | PreviewTab
  | PullRequestTab;

type CommitDiffInput =
  | GitLogEntry
  | {
      author?: string;
      email?: string;
      message?: string;
      sha: string;
      shortSha?: string;
      timestamp?: string;
    };

function defaultCommitMessage(shortSha: string): string {
  return `Commit ${shortSha}`;
}

function shortShaFromSha(sha: string): string {
  return sha.slice(0, 8);
}

export function changesDiffTabKey(): string {
  return "diff:changes";
}

export function commitDiffTabKey(sha: string): string {
  return `diff:commit:${sha}`;
}

export function pullRequestTabKey(pullRequestNumber: number): string {
  return `pull-request:${pullRequestNumber}`;
}

export function fileEditorTabKey(filePath: string): string {
  return `file:${normalizeWorkspaceFilePath(filePath)}`;
}

export function previewTabKey(key: string): string {
  return `preview:${key}`;
}

export function agentTabKey(agentSessionId: string): string {
  return `agent:${agentSessionId}`;
}

export function createChangesDiffTab(focusPath: string | null = null): ChangesDiffTab {
  return {
    focusPath,
    key: changesDiffTabKey(),
    kind: "changes-diff",
    label: "Workspace Diff",
  };
}

export function createCommitDiffTab(input: CommitDiffInput | string): CommitDiffTab {
  const sha = typeof input === "string" ? input : input.sha;
  const shortSha =
    typeof input === "string" ? shortShaFromSha(sha) : (input.shortSha ?? shortShaFromSha(sha));
  const message =
    typeof input === "string"
      ? defaultCommitMessage(shortSha)
      : (input.message ?? defaultCommitMessage(shortSha));

  return {
    author: typeof input === "string" ? "" : (input.author ?? ""),
    email: typeof input === "string" ? "" : (input.email ?? ""),
    key: commitDiffTabKey(sha),
    kind: "commit-diff",
    label: shortSha,
    message,
    sha,
    shortSha,
    timestamp: typeof input === "string" ? "" : (input.timestamp ?? ""),
  };
}

export function createPullRequestTab(input: GitPullRequestSummary): PullRequestTab {
  return {
    ...input,
    key: pullRequestTabKey(input.number),
    kind: "pull-request",
    label: `PR #${input.number}`,
  };
}

export function createFileEditorTab(filePath: string): FileEditorTab {
  const normalizedFilePath = normalizeWorkspaceFilePath(filePath);

  return {
    extension: workspaceFileExtension(normalizedFilePath),
    filePath: normalizedFilePath,
    key: fileEditorTabKey(normalizedFilePath),
    kind: "file-editor",
    label: workspaceFileBasename(normalizedFilePath),
  };
}

export function createPreviewTab(input: { key: string; label: string; url: string }): PreviewTab {
  return {
    key: previewTabKey(input.key),
    kind: "preview",
    label: input.label,
    url: input.url,
  };
}

export function createAgentTab(input: {
  agentSessionId: string;
  provider: AgentSessionProviderId;
  label: string;
}): AgentTab {
  return {
    agentSessionId: input.agentSessionId,
    provider: input.provider,
    key: agentTabKey(input.agentSessionId),
    kind: "agent",
    label: input.label,
  };
}

export function isChangesDiffTab(tab: WorkspaceCanvasTab): tab is ChangesDiffTab {
  return tab.kind === "changes-diff";
}

export function isCommitDiffTab(tab: WorkspaceCanvasTab): tab is CommitDiffTab {
  return tab.kind === "commit-diff";
}

export function isPullRequestTab(tab: WorkspaceCanvasTab): tab is PullRequestTab {
  return tab.kind === "pull-request";
}

export function isFileEditorTab(tab: WorkspaceCanvasTab): tab is FileEditorTab {
  return tab.kind === "file-editor";
}

export function isPreviewTab(tab: WorkspaceCanvasTab): tab is PreviewTab {
  return tab.kind === "preview";
}

export function isAgentTab(tab: WorkspaceCanvasTab): tab is AgentTab {
  return tab.kind === "agent";
}

export function serializeCommitDiffTab(tab: CommitDiffTab): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    kind: "commit-diff",
    sha: tab.sha,
    shortSha: tab.shortSha,
  };

  if (tab.message !== defaultCommitMessage(tab.shortSha)) {
    serialized.message = tab.message;
  }

  if (tab.author) {
    serialized.author = tab.author;
  }

  if (tab.email) {
    serialized.email = tab.email;
  }

  if (tab.timestamp) {
    serialized.timestamp = tab.timestamp;
  }

  return serialized;
}

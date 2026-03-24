import type {
  AgentSessionProviderId,
  GitLogEntry,
  GitPullRequestSummary,
} from "@lifecycle/contracts";

export interface ChangesDiffOpenInput {
  focusPath: string | null;
  kind: "changes-diff";
}

export interface ChangesDiffOpenRequest extends ChangesDiffOpenInput {
  id: string;
}

export interface CommitDiffOpenInput {
  commit: GitLogEntry;
  kind: "commit-diff";
}

export interface CommitDiffOpenRequest extends CommitDiffOpenInput {
  id: string;
}

export interface PullRequestOpenInput {
  kind: "pull-request";
  pullRequest: GitPullRequestSummary;
}

export interface PullRequestOpenRequest extends PullRequestOpenInput {
  id: string;
}

export interface FileViewerOpenInput {
  filePath: string;
  kind: "file-viewer";
}

export interface FileViewerOpenRequest extends FileViewerOpenInput {
  id: string;
}

export interface PreviewOpenInput {
  kind: "preview";
  label: string;
  previewKey: string;
  url: string;
}

export interface PreviewOpenRequest extends PreviewOpenInput {
  id: string;
}

export interface AgentOpenInput {
  agentSessionId: string;
  provider: AgentSessionProviderId;
  kind: "agent";
  label: string;
}

export interface AgentOpenRequest extends AgentOpenInput {
  id: string;
}

export type OpenDocumentInput =
  | AgentOpenInput
  | ChangesDiffOpenInput
  | CommitDiffOpenInput
  | FileViewerOpenInput
  | PreviewOpenInput
  | PullRequestOpenInput;

export type WorkspaceDocumentKind = OpenDocumentInput["kind"];

export function createOpenDocumentRequest(input: OpenDocumentInput): OpenDocumentRequest {
  return {
    ...input,
    id: crypto.randomUUID(),
  };
}

export function createChangesDiffOpenInput(focusPath: string | null): ChangesDiffOpenInput {
  return {
    focusPath,
    kind: "changes-diff",
  };
}

export function createCommitDiffOpenInput(commit: GitLogEntry): CommitDiffOpenInput {
  return {
    commit,
    kind: "commit-diff",
  };
}

export function createPullRequestOpenInput(
  pullRequest: GitPullRequestSummary,
): PullRequestOpenInput {
  return {
    kind: "pull-request",
    pullRequest,
  };
}

export function createFileViewerOpenInput(filePath: string): FileViewerOpenInput {
  return {
    filePath,
    kind: "file-viewer",
  };
}

export function createPreviewOpenInput(input: {
  label: string;
  previewKey: string;
  url: string;
}): PreviewOpenInput {
  return {
    kind: "preview",
    label: input.label,
    previewKey: input.previewKey,
    url: input.url,
  };
}

export function createAgentOpenInput(input: {
  agentSessionId: string;
  provider: AgentSessionProviderId;
  label: string;
}): AgentOpenInput {
  return {
    agentSessionId: input.agentSessionId,
    provider: input.provider,
    kind: "agent",
    label: input.label,
  };
}

export type OpenDocumentRequest =
  | AgentOpenRequest
  | ChangesDiffOpenRequest
  | CommitDiffOpenRequest
  | FileViewerOpenRequest
  | PreviewOpenRequest
  | PullRequestOpenRequest;

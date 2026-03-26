import type {
  AgentSessionProviderId,
  GitLogEntry,
  GitPullRequestSummary,
} from "@lifecycle/contracts";

export interface ChangesDiffSurfaceOptions {
  focusPath: string | null;
}

export interface CommitDiffSurfaceOptions {
  commit: GitLogEntry;
}

export interface PullRequestSurfaceOptions {
  pullRequest: GitPullRequestSummary;
}

export interface FileEditorSurfaceOptions {
  filePath: string;
}

export interface PreviewSurfaceOptions {
  label: string;
  previewKey: string;
  url: string;
}

export interface AgentSurfaceOptions {
  agentSessionId: string;
  label: string;
  provider: AgentSessionProviderId;
}

export interface AgentSurfaceLaunchOptions {
  provider: AgentSessionProviderId;
}

export type OpenSurfaceInput =
  | { options: AgentSurfaceOptions; surface: "agent" }
  | { options: ChangesDiffSurfaceOptions; surface: "changes-diff" }
  | { options: CommitDiffSurfaceOptions; surface: "commit-diff" }
  | { options: FileEditorSurfaceOptions; surface: "file-editor" }
  | { options: PreviewSurfaceOptions; surface: "preview" }
  | { options: PullRequestSurfaceOptions; surface: "pull-request" };

export type WorkspaceSurfaceKind = OpenSurfaceInput["surface"];

export type OpenSurfaceRequest = OpenSurfaceInput & { id: string };

export type SurfaceLaunchRequest = { options: AgentSurfaceLaunchOptions; surface: "agent" };

export function createAgentSurfaceLaunchRequest(
  provider: AgentSessionProviderId,
): SurfaceLaunchRequest {
  return {
    options: { provider },
    surface: "agent",
  };
}

export function createOpenSurfaceRequest(input: OpenSurfaceInput): OpenSurfaceRequest {
  return {
    ...input,
    id: crypto.randomUUID(),
  };
}

export function createChangesDiffOpenInput(focusPath: string | null): OpenSurfaceInput {
  return {
    options: { focusPath },
    surface: "changes-diff",
  };
}

export function createCommitDiffOpenInput(commit: GitLogEntry): OpenSurfaceInput {
  return {
    options: { commit },
    surface: "commit-diff",
  };
}

export function createPullRequestOpenInput(pullRequest: GitPullRequestSummary): OpenSurfaceInput {
  return {
    options: { pullRequest },
    surface: "pull-request",
  };
}

export function createFileEditorOpenInput(filePath: string): OpenSurfaceInput {
  return {
    options: { filePath },
    surface: "file-editor",
  };
}

export function createPreviewOpenInput(input: PreviewSurfaceOptions): OpenSurfaceInput {
  return {
    options: input,
    surface: "preview",
  };
}

export function createAgentOpenInput(input: AgentSurfaceOptions): OpenSurfaceInput {
  return {
    options: input,
    surface: "agent",
  };
}

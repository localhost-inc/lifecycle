import type { GitLogEntry, GitPullRequestSummary } from "@lifecycle/contracts";

export interface ChangesDiffOpenRequest {
  focusPath: string | null;
  id: string;
  kind: "changes-diff";
}

export interface CommitDiffOpenRequest {
  commit: GitLogEntry;
  id: string;
  kind: "commit-diff";
}

export interface PullRequestOpenRequest {
  id: string;
  pullRequest: GitPullRequestSummary;
  kind: "pull-request";
}

export interface FileViewerOpenRequest {
  filePath: string;
  id: string;
  kind: "file-viewer";
}

export type OpenDocumentRequest =
  | ChangesDiffOpenRequest
  | CommitDiffOpenRequest
  | FileViewerOpenRequest
  | PullRequestOpenRequest;

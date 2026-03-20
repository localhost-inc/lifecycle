import type { GitLogEntry, GitPullRequestSummary } from "@lifecycle/contracts";
import type { StatusDotTone } from "@lifecycle/ui";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceDocumentKind } from "@/features/workspaces/components/workspace-canvas-requests";

export type WorkspaceExtensionId =
  | "environment"
  | "git-changes"
  | "git-history"
  | "pull-requests"
  | "session-history";

export interface ExtensionBadge {
  kind: "dot";
  tone: StatusDotTone;
}

export interface WorkspaceExtensionLaunchActions {
  openChangesDiff: (focusPath: string | null) => void;
  openCommitDiff: (entry: GitLogEntry) => void;
  openFileViewer: (filePath: string) => void;
  openPullRequest: (pullRequest: GitPullRequestSummary) => void;
}

export interface ExtensionSlot {
  badge?: ExtensionBadge | null;
  icon: LucideIcon;
  id: WorkspaceExtensionId;
  label: string;
  ownedDocumentKinds?: readonly WorkspaceDocumentKind[];
  panel: ReactNode;
}

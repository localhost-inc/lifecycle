import type {
  AgentSessionProviderId,
  GitLogEntry,
  GitPullRequestSummary,
  ServiceRecord,
} from "@lifecycle/contracts";
import type { StatusDotTone } from "@lifecycle/ui";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceSurfaceKind } from "@/features/workspaces/canvas/workspace-canvas-requests";

export type WorkspaceExtensionId =
  | "environment"
  | "explorer"
  | "git-changes"
  | "git-history"
  | "pull-requests"
  | "session-history";

export interface ExtensionBadge {
  kind: "dot";
  tone: StatusDotTone;
}

export interface WorkspaceExtensionLaunchActions {
  openAgentSession: (session: {
    id: string;
    provider: AgentSessionProviderId;
    title: string;
  }) => void;
  openChangesDiff: (focusPath: string | null) => void;
  openCommitDiff: (entry: GitLogEntry) => void;
  openFileEditor: (filePath: string) => void;
  openPreview: (service: Pick<ServiceRecord, "name" | "preview_url">) => void;
  openPullRequest: (pullRequest: GitPullRequestSummary) => void;
}

export interface ExtensionSlot {
  badge?: ExtensionBadge | null;
  icon: LucideIcon;
  id: WorkspaceExtensionId;
  label: string;
  ownedSurfaceKinds?: readonly WorkspaceSurfaceKind[];
  panel: ReactNode;
}

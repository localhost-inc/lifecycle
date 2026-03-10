import type {
  GitBranchPullRequestResult,
  GitStatusResult,
} from "@lifecycle/contracts";
import type { OpenInAppId } from "../workspaces/api";
import type { OpenInTarget } from "../workspaces/lib/open-in-targets";

export interface HostedOverlayAnchor {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface HostedOverlayPlacement {
  align: "center" | "end" | "start";
  estimatedHeight: number;
  gutter: number;
  preferredWidth: number;
  side: "bottom" | "top";
  sideOffset: number;
}

interface HostedOverlayBase {
  anchor: HostedOverlayAnchor;
  overlayId: string;
  ownerWindowLabel: string;
  placement: HostedOverlayPlacement;
  requiresWindowFocus: boolean;
}

export interface HostedWorkspaceOpenInOverlay extends HostedOverlayBase {
  availableTargets: readonly OpenInTarget[];
  defaultTargetId: OpenInAppId;
  kind: "workspace-open-in";
  launchError: string | null;
  launchingTarget: OpenInAppId | null;
}

export interface HostedGitActionsOverlay extends HostedOverlayBase {
  actionError: string | null;
  branchPullRequest: GitBranchPullRequestResult | null;
  commitMessage: string;
  gitStatus: GitStatusResult | null;
  isCommitting: boolean;
  isCreatingPullRequest: boolean;
  isMergingPullRequest: boolean;
  isPushingBranch: boolean;
  kind: "git-actions";
}

export type HostedOverlayPayload = HostedGitActionsOverlay | HostedWorkspaceOpenInOverlay;

export interface HostedOverlayStatusRequest {
  ownerWindowLabel: string;
}

export interface HostedOverlayReadyEvent {
  hostWindowLabel: string;
}

export interface HostedOverlayAnchorUpdate {
  anchor: HostedOverlayAnchor;
  overlayId: string;
  ownerWindowLabel: string;
}

export interface HostedOverlayCloseRequest {
  overlayId: string;
  ownerWindowLabel: string;
}

interface HostedOverlayActionBase {
  overlayId: string;
  ownerWindowLabel: string;
}

export type HostedOverlayAction =
  | (HostedOverlayActionBase & {
      action: "open-in";
      appId: OpenInAppId;
      kind: "workspace-open-in";
    })
  | (HostedOverlayActionBase & {
      action: "commit";
      kind: "git-actions";
      message: string;
      pushAfterCommit: boolean;
    })
  | (HostedOverlayActionBase & {
      action: "create-pull-request";
      kind: "git-actions";
    })
  | (HostedOverlayActionBase & {
      action: "merge-pull-request";
      kind: "git-actions";
      pullRequestNumber: number;
    })
  | (HostedOverlayActionBase & {
      action: "open-pull-request";
      kind: "git-actions";
      url: string;
    })
  | (HostedOverlayActionBase & {
      action: "push-branch";
      kind: "git-actions";
    })
  | (HostedOverlayActionBase & {
      action: "show-changes";
      kind: "git-actions";
    });

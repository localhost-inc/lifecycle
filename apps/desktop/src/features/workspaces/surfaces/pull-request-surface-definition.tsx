import { GitBranch } from "lucide-react";
import { PullRequestSurface } from "@/features/git/components/pull-request-surface";
import { WorkspaceSurfaceBubble } from "@/features/workspaces/surfaces/workspace-surface-tab-icons";
import {
  getOptionalString,
  isRecord,
  isValidPullRequestMergeable,
  isValidPullRequestReviewDecision,
  isValidPullRequestState,
  parsePullRequestChecks,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import {
  areWorkspaceCanvasViewStatesEqual,
  type WorkspaceSurfaceDefinition,
} from "@/features/workspaces/surfaces/workspace-surface-types";
import {
  createPullRequestTab,
  pullRequestTabKey,
  type PullRequestTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export const pullRequestSurfaceDefinition: WorkspaceSurfaceDefinition<"pull-request"> = {
  areActiveSurfacesEqual: (previous, next) =>
    previous.tab === next.tab &&
    previous.workspaceId === next.workspaceId &&
    areWorkspaceCanvasViewStatesEqual(previous.viewState, next.viewState),
  buildTabPresentation: (tab) => ({
    leading: (
      <WorkspaceSurfaceBubble tab={tab}>
        <GitBranch className="h-3.5 w-3.5" strokeWidth={1.8} />
      </WorkspaceSurfaceBubble>
    ),
    title: `PR #${tab.number} ${tab.title}`,
  }),
  createTab: (options) => createPullRequestTab(options.pullRequest),
  getTabKey: (options) => pullRequestTabKey(options.pullRequest.number),
  parsePersistedTab: parsePersistedPullRequestTab,
  renderActiveSurface: (activeSurface, context) => (
    <PullRequestSurface
      initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
      onOpenFile={context.onOpenFile}
      onScrollTopChange={(scrollTop: number) => {
        context.onTabViewStateChange(activeSurface.tab.key, scrollTop > 0 ? { scrollTop } : null);
      }}
      pullRequest={activeSurface.tab}
      workspaceId={activeSurface.workspaceId}
    />
  ),
  resolveActiveSurface: (tab, context) => ({
    kind: "pull-request",
    tab,
    viewState: context.viewStateByTabKey[tab.key] ?? null,
    workspaceId: context.workspaceId,
  }),
  serializeTab: serializePullRequestTab,
};

export function parsePersistedPullRequestTab(value: unknown): PullRequestTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const number = value.number;
  const title = getOptionalString(value, "title");
  const url = getOptionalString(value, "url");
  const state = value.state;
  const isDraft = value.isDraft;
  const author = getOptionalString(value, "author");
  const headRefName = getOptionalString(value, "headRefName");
  const baseRefName = getOptionalString(value, "baseRefName");
  const createdAt = getOptionalString(value, "createdAt");
  const updatedAt = getOptionalString(value, "updatedAt");
  const mergeable = value.mergeable;
  const reviewDecision = value.reviewDecision ?? null;
  const checks = parsePullRequestChecks(value.checks);

  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    !title ||
    !url ||
    !isValidPullRequestState(state) ||
    typeof isDraft !== "boolean" ||
    !author ||
    !headRefName ||
    !baseRefName ||
    !createdAt ||
    !updatedAt ||
    !isValidPullRequestMergeable(mergeable) ||
    checks === undefined
  ) {
    return null;
  }

  if (reviewDecision !== null && !isValidPullRequestReviewDecision(reviewDecision)) {
    return null;
  }

  const mergeStateStatus =
    value.mergeStateStatus === null || value.mergeStateStatus === undefined
      ? null
      : (getOptionalString(value, "mergeStateStatus") ?? undefined);
  if (mergeStateStatus === undefined) {
    return null;
  }

  return createPullRequestTab({
    author,
    baseRefName,
    checks,
    createdAt,
    headRefName,
    isDraft,
    mergeStateStatus,
    mergeable,
    number,
    reviewDecision,
    state,
    title,
    updatedAt,
    url,
  });
}

export function serializePullRequestTab(tab: PullRequestTab): Record<string, unknown> {
  return {
    author: tab.author,
    baseRefName: tab.baseRefName,
    checks: tab.checks,
    createdAt: tab.createdAt,
    headRefName: tab.headRefName,
    isDraft: tab.isDraft,
    kind: tab.kind,
    mergeStateStatus: tab.mergeStateStatus,
    mergeable: tab.mergeable,
    number: tab.number,
    reviewDecision: tab.reviewDecision,
    state: tab.state,
    title: tab.title,
    updatedAt: tab.updatedAt,
    url: tab.url,
  };
}

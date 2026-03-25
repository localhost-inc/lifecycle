import { GitCommitHorizontal } from "lucide-react";
import { GitDiffSurface } from "@/features/git/components/git-diff-surface";
import { WorkspaceSurfaceBubble } from "@/features/workspaces/surfaces/workspace-surface-tab-icons";
import {
  getOptionalString,
  isRecord,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import {
  areWorkspaceCanvasViewStatesEqual,
  type WorkspaceSurfaceDefinition,
} from "@/features/workspaces/surfaces/workspace-surface-types";
import {
  commitDiffTabKey,
  createCommitDiffTab,
  serializeCommitDiffTab,
  type CommitDiffTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export const commitDiffSurfaceDefinition: WorkspaceSurfaceDefinition<"commit-diff"> = {
  areActiveSurfacesEqual: (previous, next) =>
    previous.tab === next.tab &&
    previous.workspaceId === next.workspaceId &&
    areWorkspaceCanvasViewStatesEqual(previous.viewState, next.viewState),
  buildTabPresentation: (tab) => ({
    leading: (
      <WorkspaceSurfaceBubble tab={tab}>
        <GitCommitHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
      </WorkspaceSurfaceBubble>
    ),
    title: `${tab.shortSha} ${tab.message}`,
  }),
  createTab: (options) => createCommitDiffTab(options.commit),
  getTabKey: (options) => commitDiffTabKey(options.commit.sha),
  parsePersistedTab: parsePersistedCommitDiffTab,
  renderActiveSurface: (activeSurface, context) => (
    <GitDiffSurface
      initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
      onOpenFile={context.onOpenFile}
      onScrollTopChange={(scrollTop: number) => {
        context.onTabViewStateChange(activeSurface.tab.key, scrollTop > 0 ? { scrollTop } : null);
      }}
      source={{ commit: activeSurface.tab, mode: "commit" }}
      workspaceId={activeSurface.workspaceId}
    />
  ),
  resolveActiveSurface: (tab, context) => ({
    kind: "commit-diff",
    tab,
    viewState: context.viewStateByTabKey[tab.key] ?? null,
    workspaceId: context.workspaceId,
  }),
  serializeTab: serializeCommitDiffTab,
};

export function parsePersistedCommitDiffTab(value: unknown): CommitDiffTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const sha = getOptionalString(value, "sha");
  if (!sha) {
    return null;
  }

  for (const field of ["author", "email", "message", "shortSha", "timestamp"] as const) {
    if (field in value && value[field] !== undefined && typeof value[field] !== "string") {
      return null;
    }
  }

  return createCommitDiffTab({
    author: getOptionalString(value, "author"),
    email: getOptionalString(value, "email"),
    message: getOptionalString(value, "message"),
    sha,
    shortSha: getOptionalString(value, "shortSha"),
    timestamp: getOptionalString(value, "timestamp"),
  });
}

export { serializeCommitDiffTab };

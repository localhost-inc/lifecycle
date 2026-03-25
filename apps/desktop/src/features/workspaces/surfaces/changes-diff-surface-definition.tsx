import { FileDiff } from "lucide-react";
import { GitDiffSurface } from "@/features/git/components/git-diff-surface";
import { WorkspaceSurfaceBubble } from "@/features/workspaces/surfaces/workspace-surface-tab-icons";
import {
  getOptionalString,
  isRecord,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import {
  changesDiffTabKey,
  createChangesDiffTab,
  type ChangesDiffTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";
import {
  areWorkspaceCanvasViewStatesEqual,
  type WorkspaceSurfaceDefinition,
} from "@/features/workspaces/surfaces/workspace-surface-types";

export const changesDiffSurfaceDefinition: WorkspaceSurfaceDefinition<"changes-diff"> = {
  areActiveSurfacesEqual: (previous, next) =>
    previous.tab === next.tab &&
    previous.workspaceId === next.workspaceId &&
    areWorkspaceCanvasViewStatesEqual(previous.viewState, next.viewState),
  buildTabPresentation: (tab) => ({
    leading: (
      <WorkspaceSurfaceBubble tab={tab}>
        <FileDiff className="h-3.5 w-3.5" strokeWidth={1.8} />
      </WorkspaceSurfaceBubble>
    ),
    title: tab.label,
  }),
  createTab: (options, existingTab) => ({
    ...(existingTab ?? createChangesDiffTab()),
    focusPath: options.focusPath,
  }),
  getTabKey: () => changesDiffTabKey(),
  parsePersistedTab: parsePersistedChangesDiffTab,
  renderActiveSurface: (activeSurface, context) => (
    <GitDiffSurface
      initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
      onOpenFile={context.onOpenFile}
      onScrollTopChange={(scrollTop: number) => {
        context.onTabViewStateChange(activeSurface.tab.key, scrollTop > 0 ? { scrollTop } : null);
      }}
      source={{ focusPath: activeSurface.tab.focusPath, mode: "changes" }}
      workspaceId={activeSurface.workspaceId}
    />
  ),
  resolveActiveSurface: (tab, context) => ({
    kind: "changes-diff",
    tab,
    viewState: context.viewStateByTabKey[tab.key] ?? null,
    workspaceId: context.workspaceId,
  }),
  serializeTab: serializeChangesDiffTab,
};

export function parsePersistedChangesDiffTab(value: unknown): ChangesDiffTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const focusPath = getOptionalString(value, "focusPath") ?? null;
  return createChangesDiffTab(focusPath);
}

export function serializeChangesDiffTab(tab: ChangesDiffTab): Record<string, unknown> {
  return tab.focusPath === null
    ? { kind: tab.kind }
    : {
        focusPath: tab.focusPath,
        kind: tab.kind,
      };
}

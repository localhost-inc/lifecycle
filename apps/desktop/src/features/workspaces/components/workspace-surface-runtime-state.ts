import type { WorkspacePaneLeaf } from "../state/workspace-surface-state";
import type { RuntimeTab } from "./workspace-surface-logic";

export function getWorkspaceLiveRuntimeTabKeys(
  runtimeTabs: readonly Pick<RuntimeTab, "key">[],
): string[] {
  return runtimeTabs.map((tab) => tab.key);
}

export function getWorkspaceResolvedPaneActiveTabKeys(
  paneLeaves: readonly Pick<WorkspacePaneLeaf, "activeTabKey" | "id">[],
  visibleTabsByPaneId: Record<string, readonly Pick<RuntimeTab, "key">[]>,
): Record<string, string | null> {
  return Object.fromEntries(
    paneLeaves.map((pane) => {
      const visibleTabs = visibleTabsByPaneId[pane.id] ?? [];
      const resolvedActiveTabKey =
        pane.activeTabKey && visibleTabs.some((tab) => tab.key === pane.activeTabKey)
          ? pane.activeTabKey
          : (visibleTabs.at(-1)?.key ?? null);
      return [pane.id, resolvedActiveTabKey];
    }),
  );
}

export function getWorkspaceUnassignedLiveRuntimeTabKeys(
  liveRuntimeTabKeys: readonly string[],
  assignedPaneTabKeys: ReadonlySet<string>,
  hiddenRuntimeTabKeys: readonly string[],
): string[] {
  const hiddenRuntimeTabKeySet = new Set(hiddenRuntimeTabKeys);
  return liveRuntimeTabKeys.filter(
    (key) => !assignedPaneTabKeys.has(key) && !hiddenRuntimeTabKeySet.has(key),
  );
}

export function getWorkspaceWaitingForRuntimePaneIds(
  paneLeaves: readonly Pick<WorkspacePaneLeaf, "activeTabKey" | "id">[],
  visibleTabsByPaneId: Record<string, readonly Pick<RuntimeTab, "key">[]>,
  liveRuntimeTabKeySet: ReadonlySet<string>,
): Set<string> {
  return new Set(
    paneLeaves.flatMap((pane) =>
      pane.activeTabKey &&
      liveRuntimeTabKeySet.has(pane.activeTabKey) &&
      !(visibleTabsByPaneId[pane.id] ?? []).some((tab) => tab.key === pane.activeTabKey)
        ? [pane.id]
        : [],
    ),
  );
}

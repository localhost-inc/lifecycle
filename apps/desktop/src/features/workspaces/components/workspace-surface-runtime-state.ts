import type { WorkspacePaneTabSnapshot } from "../state/workspace-surface-state";
import type { RuntimeTab } from "./workspace-surface-tabs";

export function getWorkspaceLiveRuntimeTabKeys(
  runtimeTabs: readonly Pick<RuntimeTab, "key">[],
): string[] {
  return runtimeTabs.map((tab) => tab.key);
}

export function getWorkspaceRenderedPaneActiveTabKeys(
  paneSnapshots: readonly Pick<WorkspacePaneTabSnapshot, "activeTabKey" | "id">[],
  visibleTabsByPaneId: Record<string, readonly Pick<RuntimeTab, "key">[]>,
): Record<string, string | null> {
  return Object.fromEntries(
    paneSnapshots.map((pane) => {
      const visibleTabs = visibleTabsByPaneId[pane.id] ?? [];
      const renderedActiveTabKey =
        pane.activeTabKey && visibleTabs.some((tab) => tab.key === pane.activeTabKey)
          ? pane.activeTabKey
          : (visibleTabs.at(-1)?.key ?? null);
      return [pane.id, renderedActiveTabKey];
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

export function getWorkspacePaneIdsWaitingForSelectedRuntimeTab(
  paneSnapshots: readonly Pick<WorkspacePaneTabSnapshot, "activeTabKey" | "id">[],
  visibleTabsByPaneId: Record<string, readonly Pick<RuntimeTab, "key">[]>,
  liveRuntimeTabKeySet: ReadonlySet<string>,
): Set<string> {
  return new Set(
    paneSnapshots.flatMap((pane) =>
      pane.activeTabKey &&
      liveRuntimeTabKeySet.has(pane.activeTabKey) &&
      (visibleTabsByPaneId[pane.id] ?? []).length === 0
        ? [pane.id]
        : [],
    ),
  );
}

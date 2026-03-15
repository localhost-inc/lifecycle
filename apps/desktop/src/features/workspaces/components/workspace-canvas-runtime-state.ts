import type { WorkspacePaneTabSnapshot } from "../state/workspace-canvas-state";
import type { RuntimeTab } from "./workspace-canvas-tabs";

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

export function getWorkspaceInactiveRuntimeTerminalIds(
  liveRuntimeTabKeys: readonly string[],
  renderedActiveTabKeyByPaneId: Record<string, string | null>,
): string[] {
  const renderedRuntimeTabKeys = new Set(
    Object.values(renderedActiveTabKeyByPaneId).filter((key): key is string => key !== null),
  );

  return liveRuntimeTabKeys.flatMap((key) =>
    renderedRuntimeTabKeys.has(key) || !key.startsWith("terminal:")
      ? []
      : [key.slice("terminal:".length)],
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

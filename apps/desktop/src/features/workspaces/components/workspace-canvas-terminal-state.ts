import type { WorkspacePaneTabSnapshot } from "@/features/workspaces/state/workspace-canvas-state";
import type { TerminalTab } from "@/features/workspaces/components/workspace-canvas-tabs";

export function getWorkspaceLiveTerminalTabKeys(
  terminalTabs: readonly Pick<TerminalTab, "key">[],
): string[] {
  return terminalTabs.map((tab) => tab.key);
}

export function getWorkspaceRenderedPaneActiveTabKeys(
  paneSnapshots: readonly Pick<WorkspacePaneTabSnapshot, "activeTabKey" | "id">[],
  visibleTabsByPaneId: Record<string, readonly Pick<TerminalTab, "key">[]>,
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

export function getWorkspaceInactiveTerminalIds(
  liveTerminalTabKeys: readonly string[],
  renderedActiveTabKeyByPaneId: Record<string, string | null>,
): string[] {
  const renderedTerminalTabKeys = new Set(
    Object.values(renderedActiveTabKeyByPaneId).filter((key): key is string => key !== null),
  );

  return liveTerminalTabKeys.flatMap((key) =>
    renderedTerminalTabKeys.has(key) || !key.startsWith("terminal:")
      ? []
      : [key.slice("terminal:".length)],
  );
}

export function getWorkspaceUnassignedLiveTerminalTabKeys(
  liveTerminalTabKeys: readonly string[],
  assignedPaneTabKeys: ReadonlySet<string>,
  hiddenTerminalTabKeys: readonly string[],
): string[] {
  const hiddenTerminalTabKeySet = new Set(hiddenTerminalTabKeys);
  return liveTerminalTabKeys.filter(
    (key) => !assignedPaneTabKeys.has(key) && !hiddenTerminalTabKeySet.has(key),
  );
}

export function getWorkspacePaneIdsWaitingForSelectedTerminalTab(
  paneSnapshots: readonly Pick<WorkspacePaneTabSnapshot, "activeTabKey" | "id">[],
  visibleTabsByPaneId: Record<string, readonly Pick<TerminalTab, "key">[]>,
  liveTerminalTabKeySet: ReadonlySet<string>,
): Set<string> {
  return new Set(
    paneSnapshots.flatMap((pane) =>
      pane.activeTabKey &&
      liveTerminalTabKeySet.has(pane.activeTabKey) &&
      (visibleTabsByPaneId[pane.id] ?? []).length === 0
        ? [pane.id]
        : [],
    ),
  );
}

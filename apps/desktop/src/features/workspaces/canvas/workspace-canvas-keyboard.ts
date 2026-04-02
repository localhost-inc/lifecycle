import { useCallback, useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";
import { getAdjacentPaneId } from "@/features/workspaces/lib/workspace-pane-layout";
import {
  createAgentSurfaceLaunchRequest,
  type SurfaceLaunchRequest,
} from "@/features/workspaces/canvas/workspace-canvas-requests";
import {
  resolveWorkspaceCloseShortcutTarget,
  shouldTreatWindowCloseAsTabClose,
  type WorkspaceTabHotkeyAction,
} from "@/features/workspaces/canvas/workspace-canvas-shortcuts";
import { getWorkspaceAdjacentTabKey } from "@/features/workspaces/canvas/workspace-canvas-tabs";
import type { AgentSessionProviderId } from "@lifecycle/contracts";
import type { WorkspacePaneNode } from "@/features/workspaces/state/workspace-canvas-state";

export interface WorkspaceCanvasKeyboardInput {
  activePaneId: string;
  activePaneVisibleTabCount: number;
  activePaneVisibleTabKeys: readonly string[];
  activeTabKey: string | null;
  closeTab: (tabKey: string) => boolean;
  closeWorkspacePane: (paneId: string) => void;
  defaultNewTabLaunch: AgentSessionProviderId;
  handleLaunchSurface: (paneId: string, request: SurfaceLaunchRequest) => void;
  handleSelectPane: (paneId: string) => void;
  handleSelectTab: (paneId: string, key: string) => void;
  onCloseTab?: () => void;
  onReopenClosedTab: () => void;
  paneCount: number;
  rootPane: WorkspacePaneNode;
}

export function useWorkspaceCanvasKeyboard(input: WorkspaceCanvasKeyboardInput): void {
  const closeShortcutTriggeredAtRef = useRef(0);
  const closeShortcutHandledAtRef = useRef(0);

  const handleWorkspaceTabHotkeyAction = useCallback(
    (action: WorkspaceTabHotkeyAction): boolean => {
      switch (action.id) {
        case "canvas.pane.tab.open":
          input.handleLaunchSurface(
            input.activePaneId,
            createAgentSurfaceLaunchRequest(input.defaultNewTabLaunch),
          );
          return true;
        case "canvas.pane.tab.close": {
          const closeTarget = resolveWorkspaceCloseShortcutTarget(
            input.paneCount,
            input.activePaneVisibleTabCount,
          );
          if (closeTarget === "close-pane") {
            closeShortcutHandledAtRef.current = Date.now();
            void input.closeWorkspacePane(input.activePaneId);
            return true;
          }

          if (closeTarget === "close-repository-tab" && input.onCloseTab) {
            closeShortcutHandledAtRef.current = Date.now();
            input.onCloseTab();
            return true;
          }

          if (!input.activeTabKey) {
            return true;
          }

          const isLastTabInPane = input.activePaneVisibleTabCount === 1 && input.paneCount > 1;
          closeShortcutHandledAtRef.current = Date.now();

          if (isLastTabInPane) {
            void input.closeWorkspacePane(input.activePaneId);
          } else {
            input.closeTab(input.activeTabKey);
          }

          return true;
        }
        case "canvas.pane.tab.select.next": {
          const nextKey = getWorkspaceAdjacentTabKey(
            input.activePaneVisibleTabKeys,
            input.activeTabKey,
            "next",
          );
          if (nextKey) {
            input.handleSelectTab(input.activePaneId, nextKey);
          }
          return true;
        }
        case "canvas.pane.tab.select.previous": {
          const previousKey = getWorkspaceAdjacentTabKey(
            input.activePaneVisibleTabKeys,
            input.activeTabKey,
            "previous",
          );
          if (previousKey) {
            input.handleSelectTab(input.activePaneId, previousKey);
          }
          return true;
        }
        case "canvas.tab.reopen":
          input.onReopenClosedTab();
          return true;
      }
    },
    [input],
  );

  useShortcutRegistration({
    allowInEditable: true,
    handler: () => handleWorkspaceTabHotkeyAction({ id: "canvas.pane.tab.open" }),
    id: "canvas.pane.tab.open",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    allowInEditable: true,
    handler: () => {
      closeShortcutTriggeredAtRef.current = Date.now();
      return handleWorkspaceTabHotkeyAction({ id: "canvas.pane.tab.close" });
    },
    id: "canvas.pane.tab.close",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    allowInEditable: true,
    handler: () => handleWorkspaceTabHotkeyAction({ id: "canvas.tab.reopen" }),
    id: "canvas.tab.reopen",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    allowInEditable: true,
    handler: () => handleWorkspaceTabHotkeyAction({ id: "canvas.pane.tab.select.previous" }),
    id: "canvas.pane.tab.select.previous",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    allowInEditable: true,
    handler: () => handleWorkspaceTabHotkeyAction({ id: "canvas.pane.tab.select.next" }),
    id: "canvas.pane.tab.select.next",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  useShortcutRegistration({
    allowInEditable: true,
    handler: (match) => {
      if (!match.direction) {
        return false;
      }

      const adjacentId = getAdjacentPaneId(input.rootPane, input.activePaneId, match.direction);
      if (adjacentId) {
        input.handleSelectPane(adjacentId);
      }
      return true;
    },
    id: "canvas.pane.focus",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  // Intercept Tauri window close to treat Cmd+W as tab close, not app close.
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onCloseRequested((event) => {
        const now = Date.now();
        if (
          !input.activeTabKey ||
          input.activePaneVisibleTabCount === 0 ||
          !shouldTreatWindowCloseAsTabClose(closeShortcutTriggeredAtRef.current, now)
        ) {
          return;
        }

        closeShortcutTriggeredAtRef.current = 0;
        event.preventDefault();
        if (shouldTreatWindowCloseAsTabClose(closeShortcutHandledAtRef.current, now)) {
          return;
        }
        handleWorkspaceTabHotkeyAction({ id: "canvas.pane.tab.close" });
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }

        unlisten = cleanup;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [input.activePaneVisibleTabCount, input.activeTabKey, handleWorkspaceTabHotkeyAction]);
}

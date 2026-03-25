import { useCallback, useEffect, useState } from "react";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";
import type { WorkspaceCanvasTab } from "@/features/workspaces/canvas/workspace-canvas-tabs";

export interface WorkspaceCanvasZoomState {
  zoomedTabKey: string | null;
  toggleZoom: () => void;
}

export function useWorkspaceCanvasZoom(
  activeTabKey: string | null,
  visibleTabsByPaneId: Record<string, readonly WorkspaceCanvasTab[]>,
): WorkspaceCanvasZoomState {
  const [zoomedTabKey, setZoomedTabKey] = useState<string | null>(null);

  const toggleZoom = useCallback(() => {
    setZoomedTabKey((current) => (current === null ? activeTabKey : null));
  }, [activeTabKey]);

  // Clear zoom when the zoomed tab is no longer visible.
  useEffect(() => {
    if (zoomedTabKey === null) {
      return;
    }

    const allVisibleTabKeys = new Set(
      Object.values(visibleTabsByPaneId).flatMap((tabs) => tabs.map((tab) => tab.key)),
    );
    if (!allVisibleTabKeys.has(zoomedTabKey)) {
      setZoomedTabKey(null);
    }
  }, [visibleTabsByPaneId, zoomedTabKey]);

  useShortcutRegistration({
    allowInEditable: true,
    handler: () => {
      toggleZoom();
      return true;
    },
    id: "canvas.pane.tab.zoom.toggle",
    priority: SHORTCUT_HANDLER_PRIORITY.workspace,
  });

  // Escape to exit zoom.
  useEffect(() => {
    if (zoomedTabKey === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setZoomedTabKey(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomedTabKey]);

  return { zoomedTabKey, toggleZoom };
}

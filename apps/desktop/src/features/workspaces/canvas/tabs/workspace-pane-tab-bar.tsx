import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { WorkspacePaneTabBarModel } from "@/features/workspaces/canvas/workspace-pane-models";
import { useWorkspacePaneRenderCount } from "@/features/workspaces/canvas/workspace-pane-performance";
import {
  getWorkspaceTabDragShiftDirection,
  type WorkspaceTabPlacement,
} from "@/features/workspaces/canvas/workspace-canvas-tabs";
import { WorkspacePaneTabItem } from "@/features/workspaces/canvas/tabs/workspace-pane-tab-item";

const TAB_DRAG_GAP_PX = 0;
const TAB_DRAG_START_THRESHOLD_PX = 6;
const TAB_BAR_RIGHT_FADE_WIDTH_PX = 24;

const tabListStyle: CSSProperties = {
  msOverflowStyle: "none",
  paddingRight: TAB_BAR_RIGHT_FADE_WIDTH_PX,
  scrollbarWidth: "none",
};

interface WorkspaceTabPointerSession {
  draggedHeight: number;
  draggedKey: string;
  draggedWidth: number;
  grabOffsetX: number;
  grabOffsetY: number;
  initialPointerX: number;
  initialPointerY: number;
  pointerId: number;
  started: boolean;
}

export interface WorkspacePaneTabDrag {
  draggedHeight: number;
  draggedWidth: number;
  grabOffsetX: number;
  grabOffsetY: number;
  paneId: string;
  pointerDeltaX: number;
  pointerDeltaY: number;
  pointerX: number;
  pointerY: number;
  tabKey: string;
}

export interface WorkspacePaneTabBarDragPreview {
  draggedKey: string;
  draggedWidth: number;
  placement: WorkspaceTabPlacement | null;
  targetKey: string | null;
}

interface WorkspacePaneTabBarProps {
  model: WorkspacePaneTabBarModel;
  onCloseTab: (tabKey: string) => void;
  onSelectTab: (key: string) => void;
  onTabDrag: (drag: WorkspacePaneTabDrag | null) => void;
  onTabDragCommit: (drag: WorkspacePaneTabDrag) => void;
}

interface WorkspaceTabListScrollMetrics {
  clientWidth: number;
  scrollLeft: number;
}

interface WorkspaceTabScrollTargetMetrics {
  offsetLeft: number;
  offsetWidth: number;
}

export function getWorkspaceActiveTabScrollLeft(
  tabList: WorkspaceTabListScrollMetrics,
  tabElement: WorkspaceTabScrollTargetMetrics,
  obscuredRightWidth = TAB_BAR_RIGHT_FADE_WIDTH_PX,
) {
  const availableWidth = tabList.clientWidth - obscuredRightWidth;
  if (availableWidth <= 0) {
    return null;
  }

  const visibleLeft = tabList.scrollLeft;
  const visibleRight = visibleLeft + availableWidth;
  const tabLeft = tabElement.offsetLeft;
  const tabRight = tabLeft + tabElement.offsetWidth;

  if (tabLeft < visibleLeft) {
    return Math.max(0, tabLeft);
  }

  if (tabRight > visibleRight) {
    return Math.max(0, tabRight - availableWidth);
  }

  return null;
}

export function hasStartedWorkspaceTabDrag(
  pointerDeltaX: number,
  pointerDeltaY: number,
  thresholdPx: number = TAB_DRAG_START_THRESHOLD_PX,
): boolean {
  return Math.hypot(pointerDeltaX, pointerDeltaY) >= thresholdPx;
}

export function WorkspacePaneTabBar({
  model,
  onCloseTab,
  onSelectTab,
  onTabDrag,
  onTabDragCommit,
}: WorkspacePaneTabBarProps) {
  useWorkspacePaneRenderCount("WorkspacePaneTabBar", model.paneId);
  const dragSessionRef = useRef<WorkspaceTabPointerSession | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabElementsRef = useRef(new Map<string, HTMLDivElement>());
  const onTabDragRef = useRef(onTabDrag);
  const onTabDragCommitRef = useRef(onTabDragCommit);
  const bodyUserSelectRef = useRef<string | null>(null);
  const rootUserSelectRef = useRef<string | null>(null);
  const selectionCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const visibleTabs = model.tabs;
  const visibleTabKeys = visibleTabs.map((tab) => tab.key);
  const visibleTabLayoutKey = visibleTabKeys.join("\u0000");
  const activeTabLabel = visibleTabs.find((tab) => tab.key === model.activeTabKey)?.label ?? null;

  useEffect(() => {
    onTabDragRef.current = onTabDrag;
  }, [onTabDrag]);

  useEffect(() => {
    onTabDragCommitRef.current = onTabDragCommit;
  }, [onTabDragCommit]);

  useEffect(() => {
    if (!model.activeTabKey) {
      return;
    }

    const tabList = tabListRef.current;
    const activeTabElement = tabElementsRef.current.get(model.activeTabKey);
    if (!tabList || !activeTabElement) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const nextScrollLeft = getWorkspaceActiveTabScrollLeft(tabList, activeTabElement);
      if (nextScrollLeft === null || Math.abs(nextScrollLeft - tabList.scrollLeft) < 1) {
        return;
      }

      tabList.scrollTo({ left: nextScrollLeft });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeTabLabel, model.activeTabKey, visibleTabLayoutKey]);

  const setTabElement = useCallback((key: string, element: HTMLDivElement | null) => {
    if (element) {
      tabElementsRef.current.set(key, element);
      return;
    }

    tabElementsRef.current.delete(key);
  }, []);

  const disableBodySelection = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (bodyUserSelectRef.current === null) {
      bodyUserSelectRef.current = document.body.style.userSelect;
    }
    if (rootUserSelectRef.current === null) {
      rootUserSelectRef.current = document.documentElement.style.userSelect;
    }

    document.body.style.userSelect = "none";
    document.documentElement.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();

    if (selectionCleanupRef.current !== null) {
      return;
    }

    const preventSelection = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("selectstart", preventSelection, true);
    document.addEventListener("dragstart", preventSelection, true);
    selectionCleanupRef.current = () => {
      document.removeEventListener("selectstart", preventSelection, true);
      document.removeEventListener("dragstart", preventSelection, true);
    };
  }, []);

  const restoreBodySelection = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    selectionCleanupRef.current?.();
    selectionCleanupRef.current = null;

    document.body.style.userSelect = bodyUserSelectRef.current ?? "";
    document.documentElement.style.userSelect = rootUserSelectRef.current ?? "";
    bodyUserSelectRef.current = null;
    rootUserSelectRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const pointerDeltaX = event.clientX - session.initialPointerX;
      const pointerDeltaY = event.clientY - session.initialPointerY;
      if (!session.started && !hasStartedWorkspaceTabDrag(pointerDeltaX, pointerDeltaY)) {
        return;
      }

      session.started = true;
      onTabDragRef.current?.({
        draggedHeight: session.draggedHeight,
        draggedWidth: session.draggedWidth,
        grabOffsetX: session.grabOffsetX,
        grabOffsetY: session.grabOffsetY,
        paneId: model.paneId,
        pointerDeltaX,
        pointerDeltaY,
        pointerX: event.clientX,
        pointerY: event.clientY,
        tabKey: session.draggedKey,
      });
    };

    const handlePointerFinish = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      if (session.started) {
        suppressClickRef.current = session.draggedKey;
        onTabDragCommitRef.current?.({
          draggedWidth: session.draggedWidth,
          draggedHeight: session.draggedHeight,
          grabOffsetX: session.grabOffsetX,
          grabOffsetY: session.grabOffsetY,
          paneId: model.paneId,
          pointerDeltaX: event.clientX - session.initialPointerX,
          pointerDeltaY: event.clientY - session.initialPointerY,
          pointerX: event.clientX,
          pointerY: event.clientY,
          tabKey: session.draggedKey,
        });
      }

      dragSessionRef.current = null;
      restoreBodySelection();
      onTabDragRef.current?.(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
      restoreBodySelection();
    };
  }, [model.paneId, restoreBodySelection]);

  const handleTabPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, key: string) => {
      if (event.button !== 0) {
        return;
      }

      disableBodySelection();
      const targetRect = event.currentTarget.getBoundingClientRect();

      dragSessionRef.current = {
        draggedHeight: targetRect.height,
        draggedKey: key,
        draggedWidth: targetRect.width,
        grabOffsetX: event.clientX - targetRect.left,
        grabOffsetY: event.clientY - targetRect.top,
        initialPointerX: event.clientX,
        initialPointerY: event.clientY,
        pointerId: event.pointerId,
        started: false,
      };
    },
    [disableBodySelection],
  );

  const handleTabClick = useCallback(
    (key: string) => {
      if (suppressClickRef.current === key) {
        suppressClickRef.current = null;
        return;
      }

      onSelectTab(key);
    },
    [onSelectTab],
  );

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, key: string) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      onSelectTab(key);
    },
    [onSelectTab],
  );

  return (
    <div className="relative min-w-0 flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 bottom-px right-0 z-[1] bg-gradient-to-l from-[var(--background)] to-transparent"
        style={{ width: TAB_BAR_RIGHT_FADE_WIDTH_PX }}
      />
      <div
        aria-label="Workspace tabs"
        className="flex h-full items-stretch gap-0 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        data-workspace-tab-bar
        role="tablist"
        ref={tabListRef}
        style={tabListStyle}
      >
        {visibleTabs.map((tab) => {
          const active = tab.key === model.activeTabKey;
          const isDropTarget = model.dragPreview?.targetKey === tab.key;
          const isDraggedTab = model.dragPreview?.draggedKey === tab.key;
          const previewShiftDirection =
            model.dragPreview?.targetKey && model.dragPreview.placement
              ? getWorkspaceTabDragShiftDirection(
                  visibleTabKeys,
                  model.dragPreview.draggedKey,
                  model.dragPreview.targetKey,
                  model.dragPreview.placement,
                  tab.key,
                )
              : 0;
          const previewShiftPx =
            previewShiftDirection === 0 || !model.dragPreview
              ? 0
              : previewShiftDirection * (model.dragPreview.draggedWidth + TAB_DRAG_GAP_PX);
          const style =
            previewShiftPx === 0 ? undefined : { transform: `translateX(${previewShiftPx}px)` };

          return (
            <WorkspacePaneTabItem
              key={tab.key}
              active={active}
              isDirty={tab.isDirty}
              isDraggedTab={isDraggedTab}
              isDropTarget={isDropTarget}
              label={tab.label}
              leading={tab.leading}
              onClick={() => handleTabClick(tab.key)}
              onClose={() => onCloseTab(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.key)}
              refCallback={(element) => setTabElement(tab.key, element)}
              style={style}
              tabKey={tab.key}
              tabIndex={active ? 0 : -1}
              title={tab.title}
            />
          );
        })}
      </div>
    </div>
  );
}

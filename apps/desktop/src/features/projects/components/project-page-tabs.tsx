import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@lifecycle/ui";
import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { useHistoryAvailability } from "../../../app/history-stack";
import { TabChip } from "../../../components/tab-chip";
import {
  getProjectContentTabDragShiftDirection,
  resolveProjectContentTabStripDropTarget,
  type ProjectContentTabPlacement,
} from "../lib/project-content-tab-order";

const PROJECT_TAB_DRAG_GAP_PX = 0;
const PROJECT_TAB_DRAG_START_THRESHOLD_PX = 6;
const PROJECT_TAB_SCROLL_EDGE_THRESHOLD_PX = 40;

interface ProjectTabPointerSession {
  draggedId: string;
  draggedWidth: number;
  initialPointerX: number;
  initialPointerY: number;
  pointerId: number;
  started: boolean;
}

interface ProjectTabDragPreview {
  draggedId: string;
  draggedWidth: number;
  placement: ProjectContentTabPlacement | null;
  pointerDeltaX: number;
  pointerDeltaY: number;
  targetId: string | null;
}

export interface ProjectPageTab {
  closable: boolean;
  id: string;
  icon: ReactNode;
  label: string;
}

interface ProjectPageTabsProps {
  activeTabId: string;
  tabs: ProjectPageTab[];
  onCloseTab: (tabId: string) => void;
  onReorderTabs: (
    draggedTabId: string,
    targetTabId: string,
    placement: ProjectContentTabPlacement,
  ) => void;
  onSelectTab: (tabId: string) => void;
}

function shouldSkipDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.closest("button, a, input, textarea, select, [role='button'], [data-no-drag]") !== null
  );
}

function hasStartedProjectTabDrag(
  pointerDeltaX: number,
  pointerDeltaY: number,
  thresholdPx: number = PROJECT_TAB_DRAG_START_THRESHOLD_PX,
): boolean {
  return Math.hypot(pointerDeltaX, pointerDeltaY) >= thresholdPx;
}

export function ProjectPageTabs({
  activeTabId,
  tabs,
  onCloseTab,
  onReorderTabs,
  onSelectTab,
}: ProjectPageTabsProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryAvailability();
  const dragSessionRef = useRef<ProjectTabPointerSession | null>(null);
  const selectionCleanupRef = useRef<(() => void) | null>(null);
  const tabElementsRef = useRef(new Map<string, HTMLDivElement>());
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const bodyUserSelectRef = useRef<string | null>(null);
  const rootUserSelectRef = useRef<string | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const [dragPreview, setDragPreview] = useState<ProjectTabDragPreview | null>(null);

  const handleMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || shouldSkipDrag(event.target) || !isTauri()) {
      return;
    }

    void getCurrentWindow()
      .startDragging()
      .catch((error) => {
        console.warn("Failed to start window dragging:", error);
      });
  };

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

    if (selectionCleanupRef.current) {
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

  const setTabElement = useCallback((tabId: string, element: HTMLDivElement | null) => {
    if (element) {
      tabElementsRef.current.set(tabId, element);
      return;
    }

    tabElementsRef.current.delete(tabId);
  }, []);

  const maybeAutoScrollTabStrip = useCallback((pointerX: number) => {
    const tabStrip = tabStripRef.current;
    if (!tabStrip) {
      return;
    }

    const bounds = tabStrip.getBoundingClientRect();
    const leftDistance = pointerX - bounds.left;
    const rightDistance = bounds.right - pointerX;

    if (leftDistance < PROJECT_TAB_SCROLL_EDGE_THRESHOLD_PX) {
      const scrollStep = Math.max(
        12,
        PROJECT_TAB_SCROLL_EDGE_THRESHOLD_PX - Math.max(0, leftDistance),
      );
      tabStrip.scrollLeft -= scrollStep;
      return;
    }

    if (rightDistance < PROJECT_TAB_SCROLL_EDGE_THRESHOLD_PX) {
      const scrollStep = Math.max(
        12,
        PROJECT_TAB_SCROLL_EDGE_THRESHOLD_PX - Math.max(0, rightDistance),
      );
      tabStrip.scrollLeft += scrollStep;
    }
  }, []);

  const resolveDragTarget = useCallback(
    (
      draggedTabId: string,
      pointerX: number,
      pointerY: number,
    ): { placement: ProjectContentTabPlacement; targetId: string } | null => {
      const tabStripBounds = tabStripRef.current?.getBoundingClientRect();
      if (!tabStripBounds || pointerY < tabStripBounds.top || pointerY > tabStripBounds.bottom) {
        return null;
      }

      const visibleTargets = tabs
        .map((tab) => {
          const element = tabElementsRef.current.get(tab.id);
          if (!element) {
            return null;
          }

          return {
            id: tab.id,
            left: element.getBoundingClientRect().left,
            width: element.getBoundingClientRect().width,
          };
        })
        .filter((entry): entry is { id: string; left: number; width: number } => Boolean(entry));

      if (visibleTargets.length === 0) {
        return null;
      }

      return resolveProjectContentTabStripDropTarget({
        draggedId: draggedTabId,
        pointerX,
        tabRects: visibleTargets,
      });
    },
    [tabs],
  );

  const goBack = useCallback(() => {
    if (!canGoBack) {
      return;
    }

    navigate(-1);
  }, [canGoBack, navigate]);

  const goForward = useCallback(() => {
    if (!canGoForward) {
      return;
    }

    navigate(1);
  }, [canGoForward, navigate]);

  useShortcutRegistration({
    handler: () => {
      goBack();
    },
    id: "project.go-back",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

  useShortcutRegistration({
    handler: () => {
      goForward();
    },
    id: "project.go-forward",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

  useEffect(() => {
    const clearDragSession = () => {
      dragSessionRef.current = null;
      setDragPreview(null);
      restoreBodySelection();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const pointerDeltaX = event.clientX - session.initialPointerX;
      const pointerDeltaY = event.clientY - session.initialPointerY;
      if (!session.started && !hasStartedProjectTabDrag(pointerDeltaX, pointerDeltaY)) {
        return;
      }

      session.started = true;
      maybeAutoScrollTabStrip(event.clientX);
      const dragTarget = resolveDragTarget(session.draggedId, event.clientX, event.clientY);
      setDragPreview({
        draggedId: session.draggedId,
        draggedWidth: session.draggedWidth,
        placement: dragTarget?.placement ?? null,
        pointerDeltaX,
        pointerDeltaY,
        targetId: dragTarget?.targetId ?? null,
      });
    };

    const handlePointerFinish = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      if (session.started) {
        suppressClickRef.current = session.draggedId;
        const dragTarget = resolveDragTarget(session.draggedId, event.clientX, event.clientY);
        if (dragTarget) {
          onReorderTabs(session.draggedId, dragTarget.targetId, dragTarget.placement);
        }
      }

      clearDragSession();
    };

    const handleWindowBlur = () => {
      if (!dragSessionRef.current) {
        return;
      }

      clearDragSession();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
      window.removeEventListener("blur", handleWindowBlur);
      restoreBodySelection();
    };
  }, [maybeAutoScrollTabStrip, onReorderTabs, resolveDragTarget, restoreBodySelection]);

  const handleTabPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, tabId: string) => {
      if (event.button !== 0) {
        return;
      }

      disableBodySelection();
      dragSessionRef.current = {
        draggedId: tabId,
        draggedWidth: event.currentTarget.getBoundingClientRect().width,
        initialPointerX: event.clientX,
        initialPointerY: event.clientY,
        pointerId: event.pointerId,
        started: false,
      };
    },
    [disableBodySelection],
  );

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (suppressClickRef.current === tabId) {
        suppressClickRef.current = null;
        return;
      }

      onSelectTab(tabId);
    },
    [onSelectTab],
  );

  const visibleTabIds = tabs.map((tab) => tab.id);

  return (
    <header
      className="flex h-10 shrink-0 items-stretch gap-0 border-b border-[var(--border)] bg-[var(--surface)] px-0"
      data-slot="project-page-tabs"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      <div
        className="flex shrink-0 items-center gap-1 border-r border-[var(--border)] px-3"
        data-no-drag
      >
        <Button
          aria-label="Go back"
          disabled={!canGoBack}
          onClick={goBack}
          size="icon"
          variant="ghost"
        >
          ←
        </Button>
        <Button
          aria-label="Go forward"
          disabled={!canGoForward}
          onClick={goForward}
          size="icon"
          variant="ghost"
        >
          →
        </Button>
      </div>
      <div
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
        data-no-drag
        ref={tabStripRef}
      >
        <div className="flex h-full min-w-max items-stretch">
          {tabs.map((tab) => {
            const isDraggedTab = dragPreview?.draggedId === tab.id;
            const isDropTarget = dragPreview?.targetId === tab.id;
            const previewShiftDirection =
              dragPreview?.targetId && dragPreview.placement
                ? getProjectContentTabDragShiftDirection(
                    visibleTabIds,
                    dragPreview.draggedId,
                    dragPreview.targetId,
                    dragPreview.placement,
                    tab.id,
                  )
                : 0;
            const previewShiftPx =
              previewShiftDirection === 0 || !dragPreview
                ? 0
                : previewShiftDirection * (dragPreview.draggedWidth + PROJECT_TAB_DRAG_GAP_PX);
            const style = isDraggedTab
              ? {
                  boxShadow: "var(--tab-shadow-drag)",
                  transform: `translate3d(${dragPreview.pointerDeltaX}px, ${dragPreview.pointerDeltaY}px, 0)`,
                  zIndex: 20,
                }
              : previewShiftPx === 0
                ? undefined
                : {
                    transform: `translateX(${previewShiftPx}px)`,
                  };

            return (
              <TabChip
                key={tab.id}
                active={tab.id === activeTabId}
                className={`max-w-[300px] touch-none select-none ${
                  isDraggedTab
                    ? "pointer-events-none cursor-grabbing opacity-95 transition-none"
                    : "cursor-grab transition-transform duration-150 ease-out"
                } ${isDropTarget ? "ring-1 ring-[var(--foreground)]/25" : ""}`}
                closable={tab.closable}
                label={tab.label}
                leading={tab.icon}
                onClick={() => handleTabClick(tab.id)}
                onClose={() => onCloseTab(tab.id)}
                onPointerDown={(event) => handleTabPointerDown(event, tab.id)}
                refCallback={(element) => setTabElement(tab.id, element)}
                style={style}
              />
            );
          })}
        </div>
      </div>
    </header>
  );
}

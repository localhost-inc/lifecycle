import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { isCommitDiffDocument, isLauncherDocument } from "../state/workspace-surface-state";
import {
  getWorkspaceTabDragShiftDirection,
  reorderWorkspaceTabKeys,
  tabTitle,
  workspaceTabDomId,
  workspaceTabPanelId,
  type WorkspaceSurfaceTab,
  type WorkspaceTabPlacement,
} from "./workspace-surface-logic";

const TAB_DRAG_GAP_PX = 2;
const TAB_DRAG_START_THRESHOLD_PX = 6;

interface WorkspaceTabDragState {
  draggedKey: string;
  draggedWidth: number;
  placement: WorkspaceTabPlacement | null;
  pointerDeltaX: number;
  targetKey: string | null;
}

interface WorkspaceTabPointerSession {
  draggedKey: string;
  draggedWidth: number;
  initialPointerX: number;
  pointerId: number;
  started: boolean;
}

interface WorkspaceSurfaceTabBarProps {
  activeTabKey: string | null;
  onCloseDocumentTab: (tabKey: string) => void;
  onCloseRuntimeTab: (tabKey: string, terminalId: string) => void;
  onSelectTab: (key: string) => void;
  onSetTabOrder: (keys: string[]) => void;
  renderTabLeading?: (tab: WorkspaceSurfaceTab) => ReactNode;
  visibleTabs: WorkspaceSurfaceTab[];
}

function defaultTabLeading(tab: WorkspaceSurfaceTab) {
  if (tab.type === "terminal") {
    return null;
  }

  if (isLauncherDocument(tab)) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--background)]/70 text-[11px] text-[var(--muted-foreground)]">
        +
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--background)]/70 font-mono text-[10px] text-[var(--muted-foreground)]">
      {isCommitDiffDocument(tab) ? "#" : "D"}
    </span>
  );
}

export function WorkspaceSurfaceTabBar({
  activeTabKey,
  onCloseDocumentTab,
  onCloseRuntimeTab,
  onSelectTab,
  onSetTabOrder,
  renderTabLeading,
  visibleTabs,
}: WorkspaceSurfaceTabBarProps) {
  const [dragState, setDragState] = useState<WorkspaceTabDragState | null>(null);
  const dragSessionRef = useRef<WorkspaceTabPointerSession | null>(null);
  const dragStateRef = useRef<WorkspaceTabDragState | null>(null);
  const tabElementsRef = useRef(new Map<string, HTMLDivElement>());
  const onSetTabOrderRef = useRef(onSetTabOrder);
  const suppressClickRef = useRef<string | null>(null);
  const visibleTabKeys = visibleTabs.map((tab) => tab.key);
  const visibleTabKeysRef = useRef(visibleTabKeys);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    onSetTabOrderRef.current = onSetTabOrder;
  }, [onSetTabOrder]);

  useEffect(() => {
    visibleTabKeysRef.current = visibleTabKeys;
  }, [visibleTabKeys]);

  const setTabElement = useCallback((key: string, element: HTMLDivElement | null) => {
    if (element) {
      tabElementsRef.current.set(key, element);
      return;
    }

    tabElementsRef.current.delete(key);
  }, []);

  const resolveDragTarget = useCallback((pointerX: number, draggedKey: string) => {
    const orderedKeys = visibleTabKeysRef.current.filter((key) => key !== draggedKey);
    let trailingKey: string | null = null;

    for (const key of orderedKeys) {
      const element = tabElementsRef.current.get(key);
      if (!element) {
        continue;
      }

      trailingKey = key;
      const rect = element.getBoundingClientRect();
      if (pointerX < rect.left + rect.width / 2) {
        return { placement: "before" as const, targetKey: key };
      }
    }

    return trailingKey ? { placement: "after" as const, targetKey: trailingKey } : null;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const pointerDeltaX = event.clientX - session.initialPointerX;
      if (!session.started && Math.abs(pointerDeltaX) < TAB_DRAG_START_THRESHOLD_PX) {
        return;
      }

      const nextTarget = resolveDragTarget(event.clientX, session.draggedKey);
      session.started = true;
      document.body.style.userSelect = "none";
      setDragState((current) => {
        const nextState: WorkspaceTabDragState = {
          draggedKey: session.draggedKey,
          draggedWidth: session.draggedWidth,
          placement: nextTarget?.placement ?? null,
          pointerDeltaX,
          targetKey: nextTarget?.targetKey ?? null,
        };

        if (
          current?.draggedKey === nextState.draggedKey &&
          current.draggedWidth === nextState.draggedWidth &&
          current.placement === nextState.placement &&
          current.pointerDeltaX === nextState.pointerDeltaX &&
          current.targetKey === nextState.targetKey
        ) {
          return current;
        }

        return nextState;
      });
    };

    const handlePointerFinish = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const finalDragState = dragStateRef.current;
      if (session.started) {
        suppressClickRef.current = session.draggedKey;
      }

      if (session.started && finalDragState?.targetKey && finalDragState.placement) {
        onSetTabOrderRef.current(
          reorderWorkspaceTabKeys(
            visibleTabKeysRef.current,
            session.draggedKey,
            finalDragState.targetKey,
            finalDragState.placement,
          ),
        );
      }

      dragSessionRef.current = null;
      dragStateRef.current = null;
      document.body.style.userSelect = "";
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
      document.body.style.userSelect = "";
    };
  }, [resolveDragTarget]);

  const handleTabPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, key: string) => {
      if (event.button !== 0) {
        return;
      }

      dragSessionRef.current = {
        draggedKey: key,
        draggedWidth: event.currentTarget.getBoundingClientRect().width,
        initialPointerX: event.clientX,
        pointerId: event.pointerId,
        started: false,
      };
    },
    [],
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
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[var(--background)] to-transparent"
      />
      <div
        aria-label="Workspace tabs"
        className="flex items-center gap-0.5 overflow-x-auto py-1"
        role="tablist"
      >
        {visibleTabs.map((tab) => {
          const active = tab.key === activeTabKey;
          const isTerminal = tab.type === "terminal";
          const isDropTarget = dragState?.targetKey === tab.key;
          const isDraggedTab = dragState?.draggedKey === tab.key;
          const leading = renderTabLeading ? renderTabLeading(tab) : defaultTabLeading(tab);
          const showFloatingReadyDot = isTerminal && tab.responseReady && !renderTabLeading;
          const previewShiftDirection =
            dragState?.targetKey && dragState.placement
              ? getWorkspaceTabDragShiftDirection(
                  visibleTabKeys,
                  dragState.draggedKey,
                  dragState.targetKey,
                  dragState.placement,
                  tab.key,
                )
              : 0;
          const previewShiftPx =
            previewShiftDirection === 0 || !dragState
              ? 0
              : previewShiftDirection * (dragState.draggedWidth + TAB_DRAG_GAP_PX);
          const translateX = isDraggedTab ? (dragState?.pointerDeltaX ?? 0) : previewShiftPx;

          return (
            <div
              key={tab.key}
              ref={(element) => setTabElement(tab.key, element)}
              id={workspaceTabDomId(tab.key)}
              aria-controls={workspaceTabPanelId(tab.key)}
              aria-selected={active}
              className={`group relative flex max-w-[300px] shrink-0 touch-none select-none items-center gap-1.5 rounded-[18px] px-4 py-1.5 text-left text-sm font-semibold will-change-transform ${
                active
                  ? "bg-[var(--surface-selected)] text-[var(--foreground)] shadow-[var(--tab-shadow)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              } ${
                isDraggedTab
                  ? "pointer-events-none z-20 cursor-grabbing opacity-90 shadow-[var(--tab-shadow-drag)] transition-none"
                  : "cursor-grab transition-[background-color,color,box-shadow,opacity,transform] duration-200 ease-out"
              } ${isDropTarget ? "ring-1 ring-[var(--foreground)]/35" : ""}`}
              onClick={() => handleTabClick(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.key)}
              role="tab"
              style={translateX === 0 ? undefined : { transform: `translateX(${translateX}px)` }}
              tabIndex={active ? 0 : -1}
              title={tabTitle(tab)}
            >
              {showFloatingReadyDot ? (
                <ResponseReadyDot className="pointer-events-none absolute right-3 top-1.5" />
              ) : null}
              {leading}
              <span className="truncate">{tab.label}</span>
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                data-tab-action="close"
                className={`ml-auto shrink-0 rounded-full p-1 transition hover:bg-[var(--background)]/70 ${
                  active
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                }`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();

                  if (isTerminal) {
                    void onCloseRuntimeTab(tab.key, tab.terminalId);
                    return;
                  }

                  onCloseDocumentTab(tab.key);
                }}
              >
                <svg
                  fill="none"
                  height="12"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                  viewBox="0 0 12 12"
                  width="12"
                >
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

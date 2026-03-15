import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { isCommitDiffDocument, isPullRequestDocument } from "../state/workspace-canvas-state";
import {
  getWorkspaceTabDragShiftDirection,
  type WorkspaceCanvasTab,
  type WorkspaceTabPlacement,
} from "./workspace-canvas-tabs";
import { formatWorkspaceError } from "../lib/workspace-errors";
import { WorkspacePaneTabItem } from "./workspace-pane-tab-item";

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
  activeTabKey: string | null;
  dragPreview?: WorkspacePaneTabBarDragPreview | null;
  onCloseDocumentTab: (tabKey: string) => void;
  onCloseRuntimeTab: (tabKey: string, terminalId: string) => void;
  onRenameRuntimeTab?: (terminalId: string, label: string) => Promise<unknown> | unknown;
  onSelectTab: (key: string) => void;
  onTabDrag?: (drag: WorkspacePaneTabDrag | null) => void;
  onTabDragCommit?: (drag: WorkspacePaneTabDrag) => void;
  paneId?: string;
  renderTabLeading?: (tab: WorkspaceCanvasTab) => ReactNode;
  visibleTabs: WorkspaceCanvasTab[];
}

interface WorkspaceTabRenameState {
  error: string | null;
  key: string;
  saving: boolean;
  terminalId: string;
  value: string;
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

export function renderWorkspacePaneDefaultTabLeading(tab: WorkspaceCanvasTab) {
  if (tab.kind === "terminal") {
    return null;
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface)]/70 font-mono text-[10px] text-[var(--muted-foreground)]">
      {isCommitDiffDocument(tab) ? "#" : isPullRequestDocument(tab) ? "PR" : "D"}
    </span>
  );
}

export function WorkspacePaneTabBar({
  activeTabKey,
  dragPreview = null,
  onCloseDocumentTab,
  onCloseRuntimeTab,
  onRenameRuntimeTab,
  onSelectTab,
  onTabDrag,
  onTabDragCommit,
  paneId = "pane-root",
  renderTabLeading,
  visibleTabs,
}: WorkspacePaneTabBarProps) {
  const [renameState, setRenameState] = useState<WorkspaceTabRenameState | null>(null);
  const dragSessionRef = useRef<WorkspaceTabPointerSession | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const skipRenameBlurRef = useRef(false);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabElementsRef = useRef(new Map<string, HTMLDivElement>());
  const onTabDragRef = useRef(onTabDrag);
  const onTabDragCommitRef = useRef(onTabDragCommit);
  const bodyUserSelectRef = useRef<string | null>(null);
  const rootUserSelectRef = useRef<string | null>(null);
  const selectionCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const visibleTabKeys = visibleTabs.map((tab) => tab.key);
  const visibleTabLayoutKey = visibleTabKeys.join("\u0000");
  const activeTabLabel = visibleTabs.find((tab) => tab.key === activeTabKey)?.label ?? null;

  useEffect(() => {
    onTabDragRef.current = onTabDrag;
  }, [onTabDrag]);

  useEffect(() => {
    onTabDragCommitRef.current = onTabDragCommit;
  }, [onTabDragCommit]);

  useEffect(() => {
    if (!renameState) {
      return;
    }

    const activeTab = visibleTabs.find(
      (tab) => tab.key === renameState.key && tab.kind === "terminal",
    );
    if (!activeTab) {
      setRenameState(null);
    }
  }, [renameState, visibleTabs]);

  useEffect(() => {
    if (!renameState) {
      return;
    }

    const timeoutId = setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [renameState]);

  useEffect(() => {
    if (!activeTabKey) {
      return;
    }

    const tabList = tabListRef.current;
    const activeTabElement = tabElementsRef.current.get(activeTabKey);
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
  }, [activeTabKey, activeTabLabel, visibleTabLayoutKey]);

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
        paneId,
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
          paneId,
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
  }, [paneId, restoreBodySelection]);

  const handleTabPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, key: string) => {
      if (renameState?.key === key || event.button !== 0) {
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
    [disableBodySelection, renameState],
  );

  const handleTabClick = useCallback(
    (key: string) => {
      if (renameState?.key === key) {
        return;
      }

      if (suppressClickRef.current === key) {
        suppressClickRef.current = null;
        return;
      }

      onSelectTab(key);
    },
    [onSelectTab, renameState],
  );

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, key: string) => {
      if (renameState?.key === key) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      onSelectTab(key);
    },
    [onSelectTab, renameState],
  );

  const startRenamingTab = useCallback(
    (tab: WorkspaceCanvasTab) => {
      if (tab.kind !== "terminal" || !onRenameRuntimeTab) {
        return;
      }

      dragSessionRef.current = null;
      restoreBodySelection();
      onTabDragRef.current?.(null);
      skipRenameBlurRef.current = false;
      setRenameState({
        error: null,
        key: tab.key,
        saving: false,
        terminalId: tab.terminalId,
        value: tab.label,
      });
      onSelectTab(tab.key);
    },
    [onRenameRuntimeTab, onSelectTab, restoreBodySelection],
  );

  const cancelTabRename = useCallback(() => {
    setRenameState(null);
  }, []);

  const commitTabRename = useCallback(async () => {
    if (!renameState || !onRenameRuntimeTab || renameState.saving) {
      return;
    }

    const normalizedLabel = renameState.value.trim().replace(/\s+/g, " ");
    if (normalizedLabel.length === 0) {
      setRenameState((current) =>
        current
          ? {
              ...current,
              error: "Session title cannot be empty.",
            }
          : current,
      );
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
      return;
    }

    const currentTab = visibleTabs.find(
      (tab): tab is Extract<WorkspaceCanvasTab, { kind: "terminal" }> =>
        tab.key === renameState.key && tab.kind === "terminal",
    );
    if (!currentTab) {
      setRenameState(null);
      return;
    }

    if (normalizedLabel === currentTab.label) {
      setRenameState(null);
      return;
    }

    setRenameState((current) =>
      current
        ? {
            ...current,
            error: null,
            saving: true,
          }
        : current,
    );

    try {
      await onRenameRuntimeTab(renameState.terminalId, normalizedLabel);
      setRenameState(null);
    } catch (error) {
      setRenameState((current) =>
        current
          ? {
              ...current,
              error: formatWorkspaceError(error, "Session rename failed."),
              saving: false,
            }
          : current,
      );
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [onRenameRuntimeTab, renameState, visibleTabs]);

  return (
    <div className="relative min-w-0 flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-[1] bg-gradient-to-l from-[var(--card)] to-transparent"
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
          const active = tab.key === activeTabKey;
          const isTerminal = tab.kind === "terminal";
          const isRenaming = renameState?.key === tab.key;
          const isDropTarget = dragPreview?.targetKey === tab.key;
          const isDraggedTab = dragPreview?.draggedKey === tab.key;
          const leading = renderTabLeading
            ? renderTabLeading(tab)
            : renderWorkspacePaneDefaultTabLeading(tab);
          const showFloatingReadyDot =
            isTerminal && tab.responseReady && !active && !renderTabLeading;
          const previewShiftDirection =
            dragPreview?.targetKey && dragPreview.placement
              ? getWorkspaceTabDragShiftDirection(
                  visibleTabKeys,
                  dragPreview.draggedKey,
                  dragPreview.targetKey,
                  dragPreview.placement,
                  tab.key,
                )
              : 0;
          const previewShiftPx =
            previewShiftDirection === 0 || !dragPreview
              ? 0
              : previewShiftDirection * (dragPreview.draggedWidth + TAB_DRAG_GAP_PX);
          const style =
            previewShiftPx === 0 ? undefined : { transform: `translateX(${previewShiftPx}px)` };

          return (
            <WorkspacePaneTabItem
              key={tab.key}
              active={active}
              isDraggedTab={isDraggedTab}
              isDropTarget={isDropTarget}
              isRenaming={Boolean(isRenaming)}
              leading={leading}
              onClick={() => handleTabClick(tab.key)}
              onClose={() => {
                if (isTerminal) {
                  void onCloseRuntimeTab(tab.key, tab.terminalId);
                  return;
                }

                onCloseDocumentTab(tab.key);
              }}
              onDoubleClick={(event) => {
                if (!isTerminal || !onRenameRuntimeTab) {
                  return;
                }

                if (
                  event.target instanceof Element &&
                  event.target.closest("[data-tab-action='close']")
                ) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                startRenamingTab(tab);
              }}
              onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.key)}
              refCallback={(element) => setTabElement(tab.key, element)}
              renameError={renameState?.error ?? null}
              renameInputRef={renameInputRef}
              renameSaving={renameState?.saving ?? false}
              renameValue={renameState?.value ?? tab.label}
              showFloatingReadyDot={showFloatingReadyDot}
              style={style}
              tab={tab}
              tabIndex={isRenaming ? -1 : active ? 0 : -1}
              onRenameBlur={() => {
                if (skipRenameBlurRef.current) {
                  skipRenameBlurRef.current = false;
                  return;
                }
                void commitTabRename();
              }}
              onRenameChange={(value) => {
                setRenameState((current) =>
                  current
                    ? {
                        ...current,
                        error: null,
                        value,
                      }
                    : current,
                );
              }}
              onRenameKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitTabRename();
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  skipRenameBlurRef.current = true;
                  cancelTabRename();
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

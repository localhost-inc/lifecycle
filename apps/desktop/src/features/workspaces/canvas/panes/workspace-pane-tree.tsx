import {
  clampSplitRatio,
  getHorizontalSplitRatioFromPointer,
  getSplitRatioBounds,
  getVerticalSplitRatioFromPointer,
} from "@/lib/panel-layout";
import { notifyShellResizeListeners } from "@/components/layout/shell-resize-provider";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { SurfaceLaunchActions } from "@/features/workspaces/surfaces/surface-launch-actions";
import { WorkspacePaneContent } from "@/features/workspaces/canvas/panes/workspace-pane-content";
import {
  WorkspacePaneDropOverlay,
  resolveWorkspacePaneDropStateFromGeometry,
  type WorkspacePaneActiveTabDropState,
  type WorkspacePaneDropGeometry,
} from "@/features/workspaces/canvas/panes/workspace-pane-drop-zones";
import {
  WorkspacePaneTabBar,
  renderWorkspacePaneDefaultTabLeading,
  type WorkspacePaneTabBarDragPreview,
  type WorkspacePaneTabDrag,
} from "@/features/workspaces/canvas/tabs/workspace-pane-tab-bar";
import type {
  WorkspacePaneActiveSurfaceModel,
  WorkspacePaneModel,
  WorkspacePaneTabBarModel,
  WorkspacePaneTreeActions,
  WorkspacePaneTreeModel,
} from "@/features/workspaces/canvas/workspace-pane-models";
import type { WorkspacePaneNode } from "@/features/workspaces/state/workspace-canvas-state";
import {
  reorderWorkspaceTabKeys,
  type WorkspaceCanvasTab,
} from "@/features/workspaces/canvas/workspace-canvas-tabs";

const MIN_WORKSPACE_PANE_SIZE = 240;
const PANE_RESIZE_STEP_PX = 32;

interface WorkspacePaneTreeProps {
  actions: WorkspacePaneTreeActions;
  model: WorkspacePaneTreeModel;
}

function PaneControlButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)]"
      onClick={onClick}
      title={label}
    >
      {children}
    </button>
  );
}

function SplitRightIcon() {
  return (
    <svg
      fill="none"
      height="14"
      stroke="currentColor"
      strokeWidth="1.4"
      viewBox="0 0 16 16"
      width="14"
    >
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M8 3v10" />
    </svg>
  );
}

function SplitDownIcon() {
  return (
    <svg
      fill="none"
      height="14"
      stroke="currentColor"
      strokeWidth="1.4"
      viewBox="0 0 16 16"
      width="14"
    >
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M2.5 8h11" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.4"
      viewBox="0 0 16 16"
      width="14"
    >
      <path d="M10 2.5h3.5V6" />
      <path d="M6 13.5H2.5V10" />
      <path d="M13.5 2.5L9.5 6.5" />
      <path d="M2.5 13.5l4-4" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.4"
      viewBox="0 0 16 16"
      width="14"
    >
      <path d="M5 2.5H2.5V5" />
      <path d="M11 13.5h2.5V11" />
      <path d="M2.5 2.5l4 4" />
      <path d="M13.5 13.5l-4-4" />
    </svg>
  );
}

function ResizeHandle({
  direction,
  onDoubleClick,
  onKeyDown,
  onPointerDown,
  ratio,
}: {
  direction: "column" | "row";
  onDoubleClick: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  ratio: number;
}) {
  return direction === "row" ? (
    <div className="relative w-0 shrink-0">
      <div
        role="separator"
        aria-label="Resize workspace panes"
        aria-orientation="vertical"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(ratio * 100)}
        data-workspace-split-resizer="row"
        tabIndex={0}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        className="group absolute inset-y-0 -left-2 z-20 flex w-4 touch-none cursor-col-resize justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <div className="h-full w-px bg-[var(--border)] transition-colors group-focus-visible:bg-[var(--ring)]" />
      </div>
    </div>
  ) : (
    <div className="relative h-0 w-full shrink-0">
      <div
        role="separator"
        aria-label="Resize workspace panes"
        aria-orientation="horizontal"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        className="group absolute inset-x-0 top-1/2 z-10 flex h-3 -translate-y-1/2 cursor-row-resize items-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <div className="h-px w-full bg-[var(--border)] transition-colors group-focus-visible:bg-[var(--ring)]" />
      </div>
    </div>
  );
}

function WorkspacePaneSplitNode({
  children,
  direction,
  onResetAllSplitRatios,
  onSetSplitRatio,
  ratio,
  splitId,
}: {
  children: [ReactNode, ReactNode];
  direction: "column" | "row";
  onResetAllSplitRatios: () => void;
  onSetSplitRatio: (splitId: string, ratio: number) => void;
  ratio: number;
  splitId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const bounds = useMemo(
    () => getSplitRatioBounds(containerSize, MIN_WORKSPACE_PANE_SIZE),
    [containerSize],
  );
  const clampedRatio = useMemo(() => clampSplitRatio(ratio, bounds), [bounds, ratio]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize(direction === "row" ? rect.width : rect.height);
    };

    syncSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncSize);
      return () => window.removeEventListener("resize", syncSize);
    }

    const observer = new ResizeObserver(() => syncSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [direction]);

  useEffect(() => {
    if (clampedRatio !== ratio) {
      onSetSplitRatio(splitId, clampedRatio);
    }
  }, [clampedRatio, onSetSplitRatio, ratio, splitId]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const nextRatio =
        direction === "row"
          ? getHorizontalSplitRatioFromPointer(
              event.clientX,
              rect.left,
              rect.width,
              MIN_WORKSPACE_PANE_SIZE,
            )
          : getVerticalSplitRatioFromPointer(
              event.clientY,
              rect.top,
              rect.height,
              MIN_WORKSPACE_PANE_SIZE,
            );
      onSetSplitRatio(splitId, nextRatio);
    };

    const handlePointerUp = () => {
      notifyShellResizeListeners(false);
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
    };
  }, [direction, isResizing, onSetSplitRatio, splitId]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    notifyShellResizeListeners(true);
    return () => {
      notifyShellResizeListeners(false);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = direction === "row" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [direction, isResizing]);

  const handleSeparatorPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }, []);

  const handleSeparatorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const ratioStep = containerSize > 0 ? PANE_RESIZE_STEP_PX / containerSize : 0.08;
      const applyRatio = (nextRatio: number) => {
        event.preventDefault();
        onSetSplitRatio(splitId, clampSplitRatio(nextRatio, bounds));
      };

      if (direction === "row" && event.key === "ArrowLeft") {
        applyRatio(clampedRatio - ratioStep);
      } else if (direction === "row" && event.key === "ArrowRight") {
        applyRatio(clampedRatio + ratioStep);
      } else if (direction === "column" && event.key === "ArrowUp") {
        applyRatio(clampedRatio - ratioStep);
      } else if (direction === "column" && event.key === "ArrowDown") {
        applyRatio(clampedRatio + ratioStep);
      } else if (event.key === "Home") {
        applyRatio(bounds.minRatio);
      } else if (event.key === "End") {
        applyRatio(bounds.maxRatio);
      }
    },
    [bounds, clampedRatio, containerSize, direction, onSetSplitRatio, splitId],
  );

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-0 flex-1 overflow-hidden ${direction === "row" ? "flex-row" : "flex-col"}`}
    >
      <div
        className="flex min-h-0 min-w-0 shrink-0 overflow-hidden"
        style={{ flexBasis: `${clampedRatio * 100}%` }}
      >
        {children[0]}
      </div>
      <ResizeHandle
        direction={direction}
        onDoubleClick={onResetAllSplitRatios}
        onKeyDown={handleSeparatorKeyDown}
        onPointerDown={handleSeparatorPointerDown}
        ratio={clampedRatio}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{children[1]}</div>
    </div>
  );
}

function getWorkspacePaneTabBarDragPreview(
  activeDrag: WorkspacePaneActiveTabDropState | null,
  paneId: string,
): WorkspacePaneTabBarDragPreview | null {
  if (!activeDrag) {
    return null;
  }

  const { drag, intent } = activeDrag;
  if (drag.paneId === paneId) {
    return {
      draggedKey: drag.tabKey,
      draggedWidth: drag.draggedWidth,
      placement: intent?.kind === "reorder" && intent.paneId === paneId ? intent.placement : null,
      targetKey: intent?.kind === "reorder" && intent.paneId === paneId ? intent.targetKey : null,
    };
  }

  if (intent?.kind === "insert" && intent.paneId === paneId && intent.surface === "tab-bar") {
    return {
      draggedKey: drag.tabKey,
      draggedWidth: drag.draggedWidth,
      placement: intent.placement,
      targetKey: intent.targetKey,
    };
  }

  return null;
}

function WorkspacePaneTabDragGhost({
  drag,
  tab,
}: {
  drag: WorkspacePaneTabDrag;
  tab: WorkspaceCanvasTab;
}) {
  const leading = renderWorkspacePaneDefaultTabLeading(tab);

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[90]"
      style={{
        transform: `translate(${drag.pointerX - drag.grabOffsetX}px,${drag.pointerY - drag.grabOffsetY}px)`,
      }}
    >
      <div
        className="flex items-center gap-2 whitespace-nowrap border-x border-[var(--border)] border-t-2 border-t-[var(--primary)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--foreground)] shadow-[var(--tab-shadow-drag)] opacity-95"
        style={{
          height: drag.draggedHeight,
          width: drag.draggedWidth,
        }}
      >
        {leading}
        <span className="min-w-0 flex-1 truncate">{tab.label}</span>
      </div>
    </div>
  );
}

export function resolveWorkspacePaneOpacity({
  dimInactivePanes,
  inactivePaneOpacity,
  isActivePane,
  isHoveredPane,
}: {
  dimInactivePanes: boolean;
  inactivePaneOpacity: number;
  isActivePane: boolean;
  isHoveredPane: boolean;
}): number {
  if (!dimInactivePanes || isActivePane) {
    return 1;
  }

  if (isHoveredPane) {
    return (inactivePaneOpacity + 1) / 2;
  }

  return inactivePaneOpacity;
}

export function shouldAutoSelectWorkspacePaneFromPointerTarget(
  target: EventTarget | null,
): boolean {
  return !(
    target instanceof Element &&
    target.closest("button, input, textarea, select, [role='button'], [data-tab-action]") !== null
  );
}

function areWorkspacePaneTabModelsEqual(
  previous: WorkspacePaneTabBarModel["tabs"],
  next: WorkspacePaneTabBarModel["tabs"],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (
      previous[index]?.dirty !== next[index]?.dirty ||
      previous[index]?.tab !== next[index]?.tab
    ) {
      return false;
    }
  }

  return true;
}

function areWorkspacePaneTabBarModelsEqual(
  previous: WorkspacePaneTabBarModel,
  next: WorkspacePaneTabBarModel,
): boolean {
  return (
    previous.activeTabKey === next.activeTabKey &&
    previous.paneId === next.paneId &&
    areWorkspacePaneTabBarDragPreviewsEqual(previous.dragPreview, next.dragPreview) &&
    areWorkspacePaneTabModelsEqual(previous.tabs, next.tabs)
  );
}

function areFileViewerSessionStatesEqual(
  previous: Extract<WorkspacePaneActiveSurfaceModel, { kind: "file-viewer" }>["sessionState"],
  next: Extract<WorkspacePaneActiveSurfaceModel, { kind: "file-viewer" }>["sessionState"],
): boolean {
  if (previous === next) {
    return true;
  }

  return (
    previous?.conflictDiskContent === next?.conflictDiskContent &&
    previous?.draftContent === next?.draftContent &&
    previous?.savedContent === next?.savedContent
  );
}

function areWorkspaceCanvasViewStatesEqual(
  previous:
    | Extract<
        WorkspacePaneActiveSurfaceModel,
        { kind: "changes-diff" | "commit-diff" | "file-viewer" | "pull-request" }
      >["viewState"]
    | null,
  next:
    | Extract<
        WorkspacePaneActiveSurfaceModel,
        { kind: "changes-diff" | "commit-diff" | "file-viewer" | "pull-request" }
      >["viewState"]
    | null,
): boolean {
  if (previous === next) {
    return true;
  }

  return previous?.fileMode === next?.fileMode && previous?.scrollTop === next?.scrollTop;
}

function areWorkspacePaneTabBarDragPreviewsEqual(
  previous: WorkspacePaneTabBarDragPreview | null,
  next: WorkspacePaneTabBarDragPreview | null,
): boolean {
  if (previous === next) {
    return true;
  }

  return (
    previous?.draggedKey === next?.draggedKey &&
    previous?.draggedWidth === next?.draggedWidth &&
    previous?.placement === next?.placement &&
    previous?.targetKey === next?.targetKey
  );
}

function areWorkspacePaneActiveSurfacesEqual(
  previous: WorkspacePaneActiveSurfaceModel,
  next: WorkspacePaneActiveSurfaceModel,
): boolean {
  if (previous.kind !== next.kind) {
    return false;
  }

  switch (previous.kind) {
    case "launcher": {
      const nextLauncher = next as Extract<WorkspacePaneActiveSurfaceModel, { kind: "launcher" }>;
      return previous.creatingSelection === nextLauncher.creatingSelection;
    }
    case "waiting-terminal":
    case "opening-terminal":
    case "loading":
      return true;
    case "terminal": {
      const nextTerminal = next as Extract<WorkspacePaneActiveSurfaceModel, { kind: "terminal" }>;
      return previous.tab === nextTerminal.tab && previous.terminal === nextTerminal.terminal;
    }
    case "changes-diff":
    case "commit-diff":
    case "pull-request": {
      const nextDocumentSurface = next as Extract<
        WorkspacePaneActiveSurfaceModel,
        { kind: "changes-diff" | "commit-diff" | "pull-request" }
      >;
      return (
        previous.document === nextDocumentSurface.document &&
        previous.workspaceId === nextDocumentSurface.workspaceId &&
        areWorkspaceCanvasViewStatesEqual(previous.viewState, nextDocumentSurface.viewState)
      );
    }
    case "preview": {
      const nextPreview = next as Extract<WorkspacePaneActiveSurfaceModel, { kind: "preview" }>;
      return previous.document === nextPreview.document;
    }
    case "agent": {
      const nextAgent = next as Extract<WorkspacePaneActiveSurfaceModel, { kind: "agent" }>;
      return (
        previous.document === nextAgent.document && previous.workspaceId === nextAgent.workspaceId
      );
    }
    case "file-viewer": {
      const nextFileViewer = next as Extract<
        WorkspacePaneActiveSurfaceModel,
        { kind: "file-viewer" }
      >;
      return (
        previous.document === nextFileViewer.document &&
        previous.workspaceId === nextFileViewer.workspaceId &&
        areWorkspaceCanvasViewStatesEqual(previous.viewState, nextFileViewer.viewState) &&
        areFileViewerSessionStatesEqual(previous.sessionState, nextFileViewer.sessionState)
      );
    }
  }
}

function areWorkspacePaneModelsEqual(
  previous: WorkspacePaneModel,
  next: WorkspacePaneModel,
): boolean {
  return (
    previous.id === next.id &&
    previous.isActive === next.isActive &&
    areWorkspacePaneTabBarModelsEqual(previous.tabBar, next.tabBar) &&
    areWorkspacePaneActiveSurfacesEqual(previous.activeSurface, next.activeSurface)
  );
}

interface WorkspacePaneLeafProps {
  actions: WorkspacePaneTreeActions;
  dimInactivePanes: boolean;
  inactivePaneOpacity: number;
  isBodyDropTarget: boolean;
  isZoomedView: boolean;
  onTabDrag: (drag: WorkspacePaneTabDrag | null) => void;
  onTabDragCommit: (drag: WorkspacePaneTabDrag) => void;
  pane: WorkspacePaneModel;
  paneCount: number;
  paneTabDragInProgress: boolean;
  setPaneElement: (paneId: string, element: HTMLElement | null) => void;
  surfaceActions: WorkspacePaneTreeModel["surfaceActions"];
}

export function areWorkspacePaneLeafPropsEqual(
  previous: WorkspacePaneLeafProps,
  next: WorkspacePaneLeafProps,
): boolean {
  return (
    previous.actions === next.actions &&
    previous.dimInactivePanes === next.dimInactivePanes &&
    previous.inactivePaneOpacity === next.inactivePaneOpacity &&
    previous.isBodyDropTarget === next.isBodyDropTarget &&
    previous.isZoomedView === next.isZoomedView &&
    previous.onTabDrag === next.onTabDrag &&
    previous.onTabDragCommit === next.onTabDragCommit &&
    previous.paneCount === next.paneCount &&
    previous.paneTabDragInProgress === next.paneTabDragInProgress &&
    previous.setPaneElement === next.setPaneElement &&
    previous.surfaceActions === next.surfaceActions &&
    areWorkspacePaneModelsEqual(previous.pane, next.pane)
  );
}

const WorkspacePaneLeaf = memo(function WorkspacePaneLeaf({
  actions,
  dimInactivePanes,
  inactivePaneOpacity,
  isBodyDropTarget,
  isZoomedView,
  onTabDrag,
  onTabDragCommit,
  pane,
  paneCount,
  paneTabDragInProgress,
  setPaneElement,
  surfaceActions,
}: WorkspacePaneLeafProps) {
  const [hovered, setHovered] = useState(false);
  const [surfaceLaunchOpen, setSurfaceLaunchOpen] = useState(false);
  const paneOpacity = resolveWorkspacePaneOpacity({
    dimInactivePanes,
    inactivePaneOpacity,
    isActivePane: pane.isActive,
    isHoveredPane: hovered,
  });

  return (
    <section
      ref={(element) => setPaneElement(pane.id, element)}
      className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)] transition-opacity duration-200 ease-in-out will-change-[opacity] ${isBodyDropTarget ? "ring-1 ring-[var(--ring)] shadow-[0_0_0_2px_var(--ring)]/50" : ""}`}
      data-workspace-pane-id={pane.id}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onPointerDownCapture={(event) => {
        if (!pane.isActive && shouldAutoSelectWorkspacePaneFromPointerTarget(event.target)) {
          actions.selectPane(pane.id);
        }
      }}
    >
      <div
        className="flex h-9 items-stretch gap-1 bg-[var(--background)] shadow-[inset_0_-1px_0_var(--border)]"
        data-workspace-pane-header
        style={{ opacity: paneOpacity }}
      >
        <WorkspacePaneTabBar
          model={pane.tabBar}
          onCloseDocumentTab={actions.closeDocumentTab}
          onCloseTerminalTab={actions.closeTerminalTab}
          onRenameTerminalTab={actions.renameTerminalTab}
          onSelectTab={(key) => actions.selectTab(pane.id, key)}
          onTabDrag={onTabDrag}
          onTabDragCommit={onTabDragCommit}
        />
        <div className="flex w-[8rem] shrink-0 items-center justify-end gap-px pr-1">
          <SurfaceLaunchActions
            actions={surfaceActions}
            onOpenChange={setSurfaceLaunchOpen}
            open={surfaceLaunchOpen}
            onLaunch={(request) => actions.launchSurface(pane.id, request)}
          />
          {!surfaceLaunchOpen ? (
            <div className="flex items-center gap-px">
              {paneCount > 1 && (
                <PaneControlButton
                  label={isZoomedView ? "Unzoom" : "Zoom"}
                  onClick={actions.toggleZoom}
                >
                  {isZoomedView ? <ZoomOutIcon /> : <ZoomInIcon />}
                </PaneControlButton>
              )}
              <PaneControlButton
                label="Split Right"
                onClick={() => actions.splitPane(pane.id, "row")}
              >
                <SplitRightIcon />
              </PaneControlButton>
              <PaneControlButton
                label="Split Down"
                onClick={() => actions.splitPane(pane.id, "column")}
              >
                <SplitDownIcon />
              </PaneControlButton>
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col" data-workspace-pane-body>
        <WorkspacePaneContent
          activeSurface={pane.activeSurface}
          onFileSessionStateChange={actions.fileSessionStateChange}
          onLaunchSurface={(request) => actions.launchSurface(pane.id, request)}
          onOpenFile={actions.openFile}
          onTabViewStateChange={actions.tabViewStateChange}
          paneDragInProgress={paneTabDragInProgress}
          paneFocused={pane.isActive}
          surfaceOpacity={paneOpacity}
        />
      </div>
    </section>
  );
}, areWorkspacePaneLeafPropsEqual);

export function WorkspacePaneTree({ actions, model }: WorkspacePaneTreeProps) {
  const zoomedPaneId = useMemo(() => {
    if (!model.zoomedTabKey) {
      return null;
    }
    for (const [paneId, pane] of Object.entries(model.panesById)) {
      if (pane.tabBar.tabs.some((entry) => entry.tab.key === model.zoomedTabKey)) {
        return paneId;
      }
    }
    return null;
  }, [model.panesById, model.zoomedTabKey]);

  const [activeTabDrag, setActiveTabDrag] = useState<WorkspacePaneActiveTabDropState | null>(null);
  const activeTabDragRef = useRef<WorkspacePaneActiveTabDropState | null>(null);
  const paneElementsRef = useRef(new Map<string, HTMLElement>());
  const visibleTabsByPaneId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(model.panesById).map(([paneId, pane]) => [
          paneId,
          pane.tabBar.tabs.map((entry) => entry.tab),
        ]),
      ),
    [model.panesById],
  );
  const draggedTab =
    activeTabDrag === null
      ? null
      : (Object.values(visibleTabsByPaneId)
          .flat()
          .find((tab) => tab.key === activeTabDrag.drag.tabKey) ?? null);

  const setPaneElement = useCallback((paneId: string, element: HTMLElement | null) => {
    if (element) {
      paneElementsRef.current.set(paneId, element);
      return;
    }

    paneElementsRef.current.delete(paneId);
  }, []);

  const getPaneDropGeometries = useCallback((): WorkspacePaneDropGeometry[] => {
    return [...paneElementsRef.current.entries()].flatMap(([paneId, paneElement]) => {
      const paneRect = paneElement.getBoundingClientRect();
      if (paneRect.width <= 0 || paneRect.height <= 0) {
        return [];
      }

      const bodyElement = paneElement.querySelector<HTMLElement>("[data-workspace-pane-body]");
      const tabBarElement = paneElement.querySelector<HTMLElement>("[data-workspace-tab-bar]");
      const bodyRect = bodyElement?.getBoundingClientRect();
      const tabBarRect = tabBarElement?.getBoundingClientRect();
      const tabRects = tabBarElement
        ? [...tabBarElement.querySelectorAll<HTMLElement>("[data-workspace-tab-key]")]
            .filter((element) => paneElement.contains(element))
            .map((element) => ({
              key: element.dataset.workspaceTabKey ?? "",
              left: element.getBoundingClientRect().left,
              width: element.getBoundingClientRect().width,
            }))
            .filter((tabRect) => tabRect.key.length > 0)
        : [];

      return [
        {
          ...(bodyRect
            ? {
                bodyRect: {
                  bottom: bodyRect.bottom,
                  height: bodyRect.height,
                  left: bodyRect.left,
                  right: bodyRect.right,
                  top: bodyRect.top,
                  width: bodyRect.width,
                },
              }
            : {}),
          paneId,
          paneRect: {
            bottom: paneRect.bottom,
            height: paneRect.height,
            left: paneRect.left,
            right: paneRect.right,
            top: paneRect.top,
            width: paneRect.width,
          },
          ...(tabBarRect
            ? {
                tabBarRect: {
                  bottom: tabBarRect.bottom,
                  height: tabBarRect.height,
                  left: tabBarRect.left,
                  right: tabBarRect.right,
                  top: tabBarRect.top,
                  width: tabBarRect.width,
                },
              }
            : {}),
          ...(tabRects.length > 0 ? { tabRects } : {}),
        },
      ];
    });
  }, []);

  const resolveDropIntent = useCallback(
    (drag: WorkspacePaneTabDrag) => {
      const paneGeometries = getPaneDropGeometries();
      const { hoveredPaneId, intent } = resolveWorkspacePaneDropStateFromGeometry({
        draggedKey: drag.tabKey,
        paneGeometries,
        paneId: drag.paneId,
        pointerX: drag.pointerX,
        pointerY: drag.pointerY,
      });
      return {
        hoveredPaneId,
        intent,
        paneGeometries,
      };
    },
    [getPaneDropGeometries],
  );

  const handleTabDrag = useCallback(
    (drag: WorkspacePaneTabDrag | null) => {
      if (!drag) {
        activeTabDragRef.current = null;
        setActiveTabDrag(null);
        return;
      }

      const nextActiveDrag = {
        drag,
        ...resolveDropIntent(drag),
      };
      activeTabDragRef.current = nextActiveDrag;
      setActiveTabDrag(nextActiveDrag);
    },
    [resolveDropIntent],
  );

  const handleTabDragCommit = useCallback(
    (drag: WorkspacePaneTabDrag) => {
      const intent =
        activeTabDragRef.current?.drag.tabKey === drag.tabKey &&
        activeTabDragRef.current.drag.paneId === drag.paneId
          ? activeTabDragRef.current.intent
          : resolveDropIntent(drag).intent;
      activeTabDragRef.current = null;
      setActiveTabDrag(null);
      if (!intent) {
        return;
      }

      if (intent.kind === "reorder") {
        const visibleTabKeys = (visibleTabsByPaneId[intent.paneId] ?? []).map((tab) => tab.key);
        actions.reconcilePaneVisibleTabOrder(
          intent.paneId,
          reorderWorkspaceTabKeys(visibleTabKeys, drag.tabKey, intent.targetKey, intent.placement),
        );
        return;
      }

      actions.moveTabToPane(
        drag.tabKey,
        drag.paneId,
        intent.paneId,
        intent.kind === "insert" ? (intent.targetKey ?? undefined) : undefined,
        intent.kind === "insert" ? (intent.placement ?? undefined) : undefined,
        intent.kind === "split" ? intent.splitDirection : undefined,
        intent.kind === "split" ? intent.splitPlacement : undefined,
        intent.kind === "split" ? intent.splitRatio : undefined,
      );
    },
    [actions, resolveDropIntent, visibleTabsByPaneId],
  );

  const renderNode = useCallback(
    (node: WorkspacePaneNode): ReactNode => {
      if (node.kind === "split") {
        return (
          <WorkspacePaneSplitNode
            key={node.id}
            direction={node.direction}
            onResetAllSplitRatios={actions.resetAllSplitRatios}
            onSetSplitRatio={actions.setSplitRatio}
            ratio={node.ratio}
            splitId={node.id}
          >
            {[
              <Fragment key={`${node.id}:first`}>{renderNode(node.first)}</Fragment>,
              <Fragment key={`${node.id}:second`}>{renderNode(node.second)}</Fragment>,
            ]}
          </WorkspacePaneSplitNode>
        );
      }

      const pane = model.panesById[node.id];
      if (!pane) {
        return null;
      }

      const tabBarDragPreview = getWorkspacePaneTabBarDragPreview(activeTabDrag, node.id);
      const isDropTargetPane =
        activeTabDrag?.intent?.paneId === node.id &&
        activeTabDrag.intent.kind === "insert" &&
        activeTabDrag.intent.surface === "body";

      return (
        <WorkspacePaneLeaf
          key={node.id}
          actions={actions}
          dimInactivePanes={model.dimInactivePanes}
          inactivePaneOpacity={model.inactivePaneOpacity}
          isBodyDropTarget={isDropTargetPane}
          isZoomedView={zoomedPaneId !== null}
          onTabDrag={handleTabDrag}
          onTabDragCommit={handleTabDragCommit}
          pane={{
            ...pane,
            tabBar: {
              ...pane.tabBar,
              dragPreview: tabBarDragPreview,
            },
          }}
          paneCount={model.paneCount}
          paneTabDragInProgress={activeTabDrag !== null}
          setPaneElement={setPaneElement}
          surfaceActions={model.surfaceActions}
        />
      );
    },
    [
      activeTabDrag,
      actions,
      model.dimInactivePanes,
      model.inactivePaneOpacity,
      model.paneCount,
      model.panesById,
      model.surfaceActions,
      zoomedPaneId,
      setPaneElement,
      handleTabDragCommit,
      handleTabDrag,
    ],
  );

  const renderedTree = zoomedPaneId
    ? renderNode({ kind: "leaf", id: zoomedPaneId })
    : renderNode(model.rootPane);

  return (
    <>
      <div className="flex min-h-0 flex-1 overflow-hidden">{renderedTree}</div>
      <WorkspacePaneDropOverlay activeDrag={activeTabDrag} />
      {activeTabDrag && draggedTab ? (
        <WorkspacePaneTabDragGhost drag={activeTabDrag.drag} tab={draggedTab} />
      ) : null}
    </>
  );
}

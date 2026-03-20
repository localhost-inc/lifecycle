import {
  clampSplitRatio,
  getHorizontalSplitRatioFromPointer,
  getSplitRatioBounds,
  getVerticalSplitRatioFromPointer,
} from "@/lib/panel-layout";
import { notifyShellResizeListeners } from "@/components/layout/shell-resize-provider";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { TerminalRecord } from "@lifecycle/contracts";
import { AnimatePresence, motion } from "motion/react";
import { type CreateTerminalRequest, type HarnessProvider } from "@/features/terminals/api";
import {
  SurfaceLaunchActions,
  type SurfaceLaunchAction,
  type SurfaceLaunchRequest,
} from "@/features/workspaces/components/surface-launch-actions";
import { WorkspacePaneContent } from "@/features/workspaces/components/workspace-pane-content";
import {
  WorkspacePaneDropOverlay,
  resolveWorkspacePaneDropStateFromGeometry,
  type WorkspacePaneActiveTabDropState,
  type WorkspacePaneDropGeometry,
} from "@/features/workspaces/components/workspace-pane-drop-zones";
import {
  WorkspacePaneTabBar,
  renderWorkspacePaneDefaultTabLeading,
  type WorkspacePaneTabBarDragPreview,
  type WorkspacePaneTabDrag,
} from "@/features/workspaces/components/workspace-pane-tab-bar";
import type { FileViewerSessionState } from "@/features/files/lib/file-session";
import type {
  WorkspacePaneNode,
  WorkspaceCanvasDocument,
  WorkspaceCanvasTabViewState,
} from "@/features/workspaces/state/workspace-canvas-state";
import {
  reorderWorkspaceTabKeys,
  type WorkspaceCanvasTab,
  type WorkspaceTabPlacement,
} from "@/features/workspaces/components/workspace-canvas-tabs";

const MIN_WORKSPACE_PANE_SIZE = 240;
const PANE_RESIZE_STEP_PX = 32;

interface WorkspacePaneTreeProps {
  activePaneId: string;
  creatingSelection: "shell" | HarnessProvider | null;
  dimInactivePanes?: boolean;
  documents: WorkspaceCanvasDocument[];
  fileSessionsByTabKey: Record<string, FileViewerSessionState>;
  inactivePaneOpacity?: number;
  onCloseDocumentTab: (tabKey: string) => void;
  onCloseTerminalTab: (tabKey: string, terminalId: string) => Promise<void>;
  onCreateTerminal: (input: CreateTerminalRequest, paneId?: string) => Promise<void>;
  onFileSessionStateChange: (tabKey: string, state: FileViewerSessionState | null) => void;
  onLaunchSurface: (paneId: string, request: SurfaceLaunchRequest) => void;
  onMoveTabToPane: (
    key: string,
    sourcePaneId: string,
    targetPaneId: string,
    targetKey?: string,
    placement?: WorkspaceTabPlacement,
    splitDirection?: "column" | "row",
    splitPlacement?: "after" | "before",
    splitRatio?: number,
  ) => void;
  onOpenFile: (filePath: string) => void;
  onRenameTerminalTab: (terminalId: string, label: string) => Promise<unknown> | unknown;
  onSelectPane: (paneId: string) => void;
  onSelectTab: (paneId: string, key: string) => void;
  onReconcilePaneVisibleTabOrder: (paneId: string, keys: string[]) => void;
  onResetAllSplitRatios: () => void;
  onSetSplitRatio: (splitId: string, ratio: number) => void;
  onSplitPane: (paneId: string, direction: "column" | "row") => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  onToggleZoom: () => void;
  paneCount: number;
  renderedActiveTabKeyByPaneId: Record<string, string | null>;
  rootPane: WorkspacePaneNode;
  surfaceActions: SurfaceLaunchAction[];
  terminals: TerminalRecord[];
  visibleTabsByPaneId: Record<string, WorkspaceCanvasTab[]>;
  viewStateByTabKey: Record<string, WorkspaceCanvasTabViewState>;
  paneIdsWaitingForSelectedTerminalTab: ReadonlySet<string>;
  workspaceId: string;
  zoomedTabKey: string | null;
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

export function WorkspacePaneTree({
  activePaneId,
  creatingSelection,
  dimInactivePanes = false,
  documents,
  fileSessionsByTabKey,
  inactivePaneOpacity = 1,
  onCloseDocumentTab,
  onCloseTerminalTab,
  onCreateTerminal,
  onFileSessionStateChange,
  onLaunchSurface,
  onMoveTabToPane,
  onOpenFile,
  onRenameTerminalTab,
  onSelectPane,
  onSelectTab,
  onReconcilePaneVisibleTabOrder,
  onResetAllSplitRatios,
  onSetSplitRatio,
  onSplitPane,
  onTabViewStateChange,
  onToggleZoom,
  paneCount,
  renderedActiveTabKeyByPaneId,
  rootPane,
  surfaceActions,
  terminals,
  visibleTabsByPaneId,
  viewStateByTabKey,
  paneIdsWaitingForSelectedTerminalTab,
  workspaceId,
  zoomedTabKey,
}: WorkspacePaneTreeProps) {
  const zoomedPaneId = useMemo(() => {
    if (!zoomedTabKey) {
      return null;
    }
    for (const [paneId, tabs] of Object.entries(visibleTabsByPaneId)) {
      if (tabs.some((tab) => tab.key === zoomedTabKey)) {
        return paneId;
      }
    }
    return null;
  }, [visibleTabsByPaneId, zoomedTabKey]);

  const [activeTabDrag, setActiveTabDrag] = useState<WorkspacePaneActiveTabDropState | null>(null);
  const [hoveredPaneId, setHoveredPaneId] = useState<string | null>(null);
  const [surfaceLaunchOpenPaneId, setSurfaceLaunchOpenPaneId] = useState<string | null>(null);
  const activeTabDragRef = useRef<WorkspacePaneActiveTabDropState | null>(null);
  const paneElementsRef = useRef(new Map<string, HTMLElement>());
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
        onReconcilePaneVisibleTabOrder(
          intent.paneId,
          reorderWorkspaceTabKeys(visibleTabKeys, drag.tabKey, intent.targetKey, intent.placement),
        );
        return;
      }

      onMoveTabToPane(
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
    [onMoveTabToPane, onReconcilePaneVisibleTabOrder, resolveDropIntent, visibleTabsByPaneId],
  );

  const renderNode = useCallback(
    (node: WorkspacePaneNode): ReactNode => {
      if (node.kind === "split") {
        return (
          <WorkspacePaneSplitNode
            key={node.id}
            direction={node.direction}
            onResetAllSplitRatios={onResetAllSplitRatios}
            onSetSplitRatio={onSetSplitRatio}
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

      const visibleTabs = visibleTabsByPaneId[node.id] ?? [];
      const activeTabKey = renderedActiveTabKeyByPaneId[node.id] ?? null;
      const activeTabViewState = activeTabKey ? (viewStateByTabKey[activeTabKey] ?? null) : null;
      const activeFileSessionState =
        activeTabKey && activeTabKey in fileSessionsByTabKey
          ? (fileSessionsByTabKey[activeTabKey] ?? null)
          : null;
      const isActivePane = node.id === activePaneId;
      const isHoveredPane = hoveredPaneId === node.id;
      const paneOpacity = resolveWorkspacePaneOpacity({
        dimInactivePanes,
        inactivePaneOpacity,
        isActivePane,
        isHoveredPane,
      });
      const paneDropIntent =
        activeTabDrag?.intent?.paneId === node.id ? activeTabDrag.intent : null;
      const tabBarDragPreview = getWorkspacePaneTabBarDragPreview(activeTabDrag, node.id);
      const isDropTargetPane =
        paneDropIntent?.kind === "insert" && paneDropIntent.surface === "body";
      const paneLaunchActionsOpen = surfaceLaunchOpenPaneId === node.id;

      return (
        <section
          key={node.id}
          ref={(element) => setPaneElement(node.id, element)}
          className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)] transition-opacity duration-200 ease-in-out will-change-[opacity] ${isDropTargetPane ? "ring-1 ring-[var(--ring)] shadow-[0_0_0_2px_var(--ring)]/50" : ""}`}
          data-workspace-pane-id={node.id}
          onPointerEnter={() => {
            setHoveredPaneId(node.id);
          }}
          onPointerLeave={() => {
            setHoveredPaneId((current) => (current === node.id ? null : current));
          }}
          onPointerDownCapture={(event) => {
            if (!isActivePane && shouldAutoSelectWorkspacePaneFromPointerTarget(event.target)) {
              onSelectPane(node.id);
            }
          }}
        >
          <div
            className="flex h-9 items-stretch gap-1 shadow-[inset_0_-1px_0_var(--border)] bg-[var(--background)]"
            data-workspace-pane-header
            style={{ opacity: paneOpacity }}
          >
            <WorkspacePaneTabBar
              activeTabKey={activeTabKey}
              dragPreview={tabBarDragPreview}
              onCloseDocumentTab={onCloseDocumentTab}
              onCloseTerminalTab={onCloseTerminalTab}
              onRenameTerminalTab={onRenameTerminalTab}
              onSelectTab={(key) => onSelectTab(node.id, key)}
              onTabDrag={handleTabDrag}
              onTabDragCommit={handleTabDragCommit}
              paneId={node.id}
              visibleTabs={visibleTabs}
            />
            <div className="flex shrink-0 items-center gap-px">
              <SurfaceLaunchActions
                actions={surfaceActions}
                onOpenChange={(nextOpen) => {
                  setSurfaceLaunchOpenPaneId(nextOpen ? node.id : null);
                }}
                open={paneLaunchActionsOpen}
                onLaunch={(request) => onLaunchSurface(node.id, request)}
              />
              <AnimatePresence initial={false}>
                {paneLaunchActionsOpen ? null : (
                  <motion.div
                    key={`${node.id}:pane-controls`}
                    animate={{ opacity: 1, width: "auto", x: 0 }}
                    className="flex items-center gap-px overflow-hidden"
                    exit={{ opacity: 0, width: 0, x: 8 }}
                    initial={{ opacity: 0, width: 0, x: 8 }}
                    transition={{ duration: 0.16, ease: "easeInOut" }}
                  >
                    {paneCount > 1 && (
                      <PaneControlButton
                        label={zoomedPaneId ? "Unzoom" : "Zoom"}
                        onClick={onToggleZoom}
                      >
                        {zoomedPaneId ? <ZoomOutIcon /> : <ZoomInIcon />}
                      </PaneControlButton>
                    )}
                    <PaneControlButton
                      label="Split Right"
                      onClick={() => onSplitPane(node.id, "row")}
                    >
                      <SplitRightIcon />
                    </PaneControlButton>
                    <PaneControlButton
                      label="Split Down"
                      onClick={() => onSplitPane(node.id, "column")}
                    >
                      <SplitDownIcon />
                    </PaneControlButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col" data-workspace-pane-body>
            <WorkspacePaneContent
              activeFileSessionState={activeFileSessionState}
              activeTabKey={activeTabKey}
              activeTabViewState={activeTabViewState}
              creatingSelection={creatingSelection}
              documents={documents}
              hasVisibleTabs={visibleTabs.length > 0}
              onCreateTerminal={(input) => onCreateTerminal(input, node.id)}
              onFileSessionStateChange={onFileSessionStateChange}
              onOpenFile={onOpenFile}
              onTabViewStateChange={onTabViewStateChange}
              paneDragInProgress={activeTabDrag !== null}
              paneFocused={isActivePane}
              surfaceOpacity={paneOpacity}
              terminals={terminals}
              waitingForSelectedTerminalTab={paneIdsWaitingForSelectedTerminalTab.has(node.id)}
              workspaceId={workspaceId}
            />
          </div>
        </section>
      );
    },
    [
      activePaneId,
      activeTabDrag,
      creatingSelection,
      dimInactivePanes,
      documents,
      fileSessionsByTabKey,
      hoveredPaneId,
      inactivePaneOpacity,
      onCloseDocumentTab,
      onCloseTerminalTab,
      onCreateTerminal,
      onFileSessionStateChange,
      onLaunchSurface,
      onMoveTabToPane,
      onOpenFile,
      onRenameTerminalTab,
      onSelectPane,
      onSelectTab,
      onReconcilePaneVisibleTabOrder,
      onResetAllSplitRatios,
      onSetSplitRatio,
      onSplitPane,
      onTabViewStateChange,
      onToggleZoom,
      paneCount,
      renderedActiveTabKeyByPaneId,
      zoomedPaneId,
      setPaneElement,
      surfaceLaunchOpenPaneId,
      surfaceActions,
      terminals,
      visibleTabsByPaneId,
      viewStateByTabKey,
      paneIdsWaitingForSelectedTerminalTab,
      workspaceId,
      handleTabDragCommit,
      handleTabDrag,
    ],
  );

  const renderedTree = zoomedPaneId
    ? renderNode({ kind: "leaf", id: zoomedPaneId })
    : renderNode(rootPane);

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

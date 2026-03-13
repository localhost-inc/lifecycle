import {
  clampSplitRatio,
  getHorizontalSplitRatioFromPointer,
  getSplitRatioBounds,
  getVerticalSplitRatioFromPointer,
} from "../../../lib/panel-layout";
import { notifyShellResizeListeners } from "../../../components/layout/shell-resize-provider";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { TerminalRecord } from "@lifecycle/contracts";
import type { CreateTerminalRequest, HarnessProvider } from "../../terminals/api";
import {
  SurfaceLaunchActions,
  type SurfaceLaunchAction,
  type SurfaceLaunchRequest,
} from "./surface-launch-actions";
import { WorkspaceSurfacePanels } from "./workspace-surface-panels";
import {
  WorkspaceSurfaceTabBar,
  renderWorkspaceSurfaceDefaultTabLeading,
  type WorkspaceSurfaceTabBarDragPreview,
  type WorkspaceSurfaceTabDrag,
} from "./workspace-surface-tab-bar";
import type { WorkspaceActivityItem } from "../hooks";
import type { FileViewerSessionState } from "../../files/lib/file-session";
import type {
  WorkspacePaneNode,
  WorkspaceSurfaceDocument,
  WorkspaceSurfaceTabViewState,
} from "../state/workspace-surface-state";
import {
  reorderWorkspaceTabKeys,
  type WorkspaceSurfaceTab,
  type WorkspaceTabPlacement,
} from "./workspace-surface-logic";

const MIN_WORKSPACE_PANE_SIZE = 240;
const PANE_DROP_CENTER_ZONE_RATIO = 0.18;
const PANE_RESIZE_STEP_PX = 32;

interface WorkspaceSurfacePaneTreeProps {
  activePaneId: string | null;
  activity: WorkspaceActivityItem[];
  creatingSelection: "shell" | HarnessProvider | null;
  documents: WorkspaceSurfaceDocument[];
  fileSessionsByTabKey: Record<string, FileViewerSessionState>;
  onCloseDocumentTab: (tabKey: string) => void;
  onClosePane: (paneId: string) => void;
  onCloseRuntimeTab: (tabKey: string, terminalId: string) => Promise<void>;
  onCreateTerminal: (
    input: CreateTerminalRequest,
    launcherKey?: string,
    paneId?: string,
  ) => Promise<void>;
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
  ) => void;
  onOpenFile: (filePath: string) => void;
  onOpenLauncher: (paneId: string) => void;
  onOpenTerminal: (terminalId: string, launcherKey?: string, paneId?: string) => void;
  onRenameRuntimeTab: (terminalId: string, label: string) => Promise<unknown> | unknown;
  onSelectPane: (paneId: string) => void;
  onSelectTab: (paneId: string, key: string) => void;
  onSetPaneTabOrder: (paneId: string, keys: string[]) => void;
  onSetSplitRatio: (splitId: string, ratio: number) => void;
  onSplitPane: (paneId: string, direction: "column" | "row") => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceSurfaceTabViewState | null) => void;
  paneCount: number;
  resolvedActiveTabKeyByPaneId: Record<string, string | null>;
  rootPane: WorkspacePaneNode;
  sessionHistory: TerminalRecord[];
  surfaceActions: SurfaceLaunchAction[];
  terminals: TerminalRecord[];
  visibleTabsByPaneId: Record<string, WorkspaceSurfaceTab[]>;
  viewStateByTabKey: Record<string, WorkspaceSurfaceTabViewState>;
  waitingForRuntimePaneIds: ReadonlySet<string>;
  workspaceId: string;
}

interface WorkspaceSurfaceActiveTabDrag {
  drag: WorkspaceSurfaceTabDrag;
  intent: WorkspaceSurfacePaneDropIntent | null;
}

interface WorkspaceSurfacePaneInsertTarget {
  kind: "insert";
  paneId: string;
  placement: WorkspaceTabPlacement | null;
  surface: "body" | "tab-bar";
  targetKey: string | null;
}

interface WorkspaceSurfacePaneSplitTarget {
  kind: "split";
  paneId: string;
  splitDirection: "column" | "row";
  splitPlacement: "after" | "before";
}

type WorkspaceSurfacePaneDropIntent =
  | WorkspaceSurfacePaneInsertTarget
  | WorkspaceSurfacePaneSplitTarget
  | {
      kind: "reorder";
      paneId: string;
      placement: WorkspaceTabPlacement;
      targetKey: string;
    };

interface WorkspaceSurfacePaneRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface WorkspaceSurfacePaneTabRect {
  key: string;
  left: number;
  width: number;
}

interface ResolveWorkspaceSurfacePaneDropTargetInput {
  candidatePaneId: string;
  draggedKey: string;
  paneId: string;
  paneRect: WorkspaceSurfacePaneRect;
  pointerOverTabBar: boolean;
  tabRects?: readonly WorkspaceSurfacePaneTabRect[];
  pointerX: number;
  pointerY: number;
}

export function resolveWorkspaceSurfaceTabStripDropTarget({
  draggedKey,
  pointerX,
  tabRects,
}: {
  draggedKey: string;
  pointerX: number;
  tabRects: readonly WorkspaceSurfacePaneTabRect[];
}): { placement: WorkspaceTabPlacement; targetKey: string } | null {
  const orderedRects = [...tabRects]
    .filter((tabRect) => tabRect.key !== draggedKey)
    .sort((left, right) => left.left - right.left);

  if (orderedRects.length === 0) {
    return null;
  }

  let trailingTabKey: string | null = null;
  for (const tabRect of orderedRects) {
    trailingTabKey = tabRect.key;
    if (pointerX < tabRect.left + tabRect.width / 2) {
      return {
        placement: "before",
        targetKey: tabRect.key,
      };
    }
  }

  return trailingTabKey
    ? {
        placement: "after",
        targetKey: trailingTabKey,
      }
    : null;
}

export function resolveWorkspaceSurfacePaneDropIntent({
  candidatePaneId,
  draggedKey,
  paneId,
  paneRect,
  pointerOverTabBar,
  tabRects = [],
  pointerX,
  pointerY,
}: ResolveWorkspaceSurfacePaneDropTargetInput): WorkspaceSurfacePaneDropIntent | null {
  if (
    pointerX < paneRect.left ||
    pointerX > paneRect.right ||
    pointerY < paneRect.top ||
    pointerY > paneRect.bottom
  ) {
    return null;
  }

  if (pointerOverTabBar) {
    const stripTarget = resolveWorkspaceSurfaceTabStripDropTarget({
      draggedKey,
      pointerX,
      tabRects,
    });
    if (candidatePaneId === paneId) {
      return stripTarget
        ? {
            kind: "reorder",
            paneId: candidatePaneId,
            placement: stripTarget.placement,
            targetKey: stripTarget.targetKey,
          }
        : null;
    }

    return {
      kind: "insert",
      paneId: candidatePaneId,
      placement: stripTarget?.placement ?? null,
      surface: "tab-bar",
      targetKey: stripTarget?.targetKey ?? null,
    };
  }

  if (paneRect.width <= 0 || paneRect.height <= 0) {
    return null;
  }

  const relativePointerX = (pointerX - paneRect.left) / paneRect.width;
  const relativePointerY = (pointerY - paneRect.top) / paneRect.height;
  const centerDistanceX = Math.abs(relativePointerX - 0.5);
  const centerDistanceY = Math.abs(relativePointerY - 0.5);
  const withinCenterZone =
    candidatePaneId !== paneId &&
    centerDistanceX <= PANE_DROP_CENTER_ZONE_RATIO &&
    centerDistanceY <= PANE_DROP_CENTER_ZONE_RATIO;

  if (withinCenterZone) {
    return {
      kind: "insert",
      paneId: candidatePaneId,
      placement: null,
      surface: "body",
      targetKey: null,
    };
  }

  if (centerDistanceX > centerDistanceY) {
    return {
      kind: "split",
      paneId: candidatePaneId,
      splitDirection: "row",
      splitPlacement: relativePointerX < 0.5 ? "before" : "after",
    };
  }

  return {
    kind: "split",
    paneId: candidatePaneId,
    splitDirection: "column",
    splitPlacement: relativePointerY < 0.5 ? "before" : "after",
  };
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--muted-foreground)] outline-none transition-[background-color,color] duration-150 ease-in-out hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_8%)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)]"
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

function ClosePaneIcon() {
  return (
    <svg
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width="14"
    >
      <path d="M4 4l8 8M12 4L4 12" />
    </svg>
  );
}

function ResizeHandle({
  direction,
  onKeyDown,
  onPointerDown,
  ratio,
  style,
}: {
  direction: "column" | "row";
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  ratio: number;
  style?: CSSProperties;
}) {
  return direction === "row" ? (
    <div className="pointer-events-none absolute inset-y-0 z-20" style={style}>
      <div
        role="separator"
        aria-label="Resize workspace panes"
        aria-orientation="vertical"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(ratio * 100)}
        data-workspace-split-resizer="row"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        className="group pointer-events-auto absolute inset-y-0 -left-2 flex w-4 touch-none cursor-col-resize justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <div className="h-full w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--ring)] group-focus-visible:bg-[var(--ring)]" />
      </div>
    </div>
  ) : (
    <div className="relative h-px w-full shrink-0">
      <div
        role="separator"
        aria-label="Resize workspace panes"
        aria-orientation="horizontal"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        className="group absolute inset-x-0 top-1/2 z-10 flex h-3 -translate-y-1/2 cursor-row-resize items-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <div className="h-px w-full bg-[var(--border)] transition-colors group-hover:bg-[var(--ring)] group-focus-visible:bg-[var(--ring)]" />
      </div>
    </div>
  );
}

function WorkspaceSurfaceSplitNode({
  children,
  direction,
  onSetSplitRatio,
  ratio,
  splitId,
}: {
  children: [ReactNode, ReactNode];
  direction: "column" | "row";
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
        className="min-h-0 min-w-0 shrink-0 overflow-hidden"
        style={
          direction === "row"
            ? { flexBasis: `${clampedRatio * 100}%` }
            : { flexBasis: `${clampedRatio * 100}%` }
        }
      >
        {children[0]}
      </div>
      {direction === "column" ? (
        <ResizeHandle
          direction={direction}
          onKeyDown={handleSeparatorKeyDown}
          onPointerDown={handleSeparatorPointerDown}
          ratio={clampedRatio}
        />
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children[1]}</div>
      {direction === "row" ? (
        <ResizeHandle
          direction={direction}
          onKeyDown={handleSeparatorKeyDown}
          onPointerDown={handleSeparatorPointerDown}
          ratio={clampedRatio}
          style={{ left: `${clampedRatio * 100}%` }}
        />
      ) : null}
    </div>
  );
}

function getWorkspaceSurfaceTabBarDragPreview(
  activeDrag: WorkspaceSurfaceActiveTabDrag | null,
  paneId: string,
): WorkspaceSurfaceTabBarDragPreview | null {
  if (!activeDrag) {
    return null;
  }

  const { drag, intent } = activeDrag;
  if (drag.paneId === paneId) {
    return {
      draggedKey: drag.tabKey,
      draggedWidth: drag.draggedWidth,
      placement:
        intent?.kind === "reorder" && intent.paneId === paneId ? intent.placement : null,
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

function PaneDropPreview({
  intent,
}: {
  intent: WorkspaceSurfacePaneDropIntent | null;
}) {
  if (!intent || intent.kind === "reorder") {
    return null;
  }

  const baseClassName =
    "pointer-events-none absolute z-10 border border-[var(--ring)]/70 bg-[color-mix(in_srgb,var(--ring),transparent_84%)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--ring),transparent_55%)]";

  if (intent.kind === "insert" && intent.surface === "body") {
    return <div className={`${baseClassName} inset-3`} />;
  }

  if (intent.kind !== "split") {
    return null;
  }

  const splitClassName =
    intent.splitDirection === "row"
      ? intent.splitPlacement === "before"
        ? "inset-y-3 left-3 w-[calc(50%-12px)]"
        : "inset-y-3 right-3 w-[calc(50%-12px)]"
      : intent.splitPlacement === "before"
        ? "inset-x-3 top-3 h-[calc(50%-12px)]"
        : "inset-x-3 bottom-3 h-[calc(50%-12px)]";

  return <div className={`${baseClassName} ${splitClassName}`} />;
}

function WorkspaceSurfaceTabDragGhost({
  drag,
  tab,
}: {
  drag: WorkspaceSurfaceTabDrag;
  tab: WorkspaceSurfaceTab;
}) {
  const leading = renderWorkspaceSurfaceDefaultTabLeading(tab);

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[90]"
      style={{
        transform: `translate(${drag.pointerX - drag.grabOffsetX}px,${drag.pointerY - drag.grabOffsetY}px)`,
      }}
    >
      <div
        className="flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-xl)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--muted),var(--background)_8%)] px-[14px] text-sm font-medium text-[var(--foreground)] shadow-[0_18px_40px_-20px_rgba(15,23,42,0.75)] opacity-95"
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

export function shouldAutoSelectWorkspacePaneFromPointerTarget(target: EventTarget | null): boolean {
  return !(
    target instanceof Element &&
    target.closest("button, input, textarea, select, [role='button'], [data-tab-action]") !== null
  );
}

export function WorkspaceSurfacePaneTree({
  activePaneId,
  activity,
  creatingSelection,
  documents,
  fileSessionsByTabKey,
  onCloseDocumentTab,
  onClosePane,
  onCloseRuntimeTab,
  onCreateTerminal,
  onFileSessionStateChange,
  onLaunchSurface,
  onMoveTabToPane,
  onOpenFile,
  onOpenLauncher,
  onOpenTerminal,
  onRenameRuntimeTab,
  onSelectPane,
  onSelectTab,
  onSetPaneTabOrder,
  onSetSplitRatio,
  onSplitPane,
  onTabViewStateChange,
  paneCount,
  resolvedActiveTabKeyByPaneId,
  rootPane,
  sessionHistory,
  surfaceActions,
  terminals,
  visibleTabsByPaneId,
  viewStateByTabKey,
  waitingForRuntimePaneIds,
  workspaceId,
}: WorkspaceSurfacePaneTreeProps) {
  const [activeTabDrag, setActiveTabDrag] = useState<WorkspaceSurfaceActiveTabDrag | null>(null);
  const paneElementsRef = useRef(new Map<string, HTMLElement>());
  const draggedTab =
    activeTabDrag === null
      ? null
      : Object.values(visibleTabsByPaneId)
          .flat()
          .find((tab) => tab.key === activeTabDrag.drag.tabKey) ?? null;

  const setPaneElement = useCallback((paneId: string, element: HTMLElement | null) => {
    if (element) {
      paneElementsRef.current.set(paneId, element);
      return;
    }

    paneElementsRef.current.delete(paneId);
  }, []);

  const resolveDropIntent = useCallback((drag: WorkspaceSurfaceTabDrag) => {
    if (typeof document === "undefined") {
      return null;
    }

    const pointedElement = document.elementFromPoint(drag.pointerX, drag.pointerY);
    if (!(pointedElement instanceof Element)) {
      return null;
    }

    const paneElement = pointedElement.closest<HTMLElement>("[data-workspace-pane-id]");
    if (!paneElement) {
      return null;
    }

    const candidatePaneId = paneElement.dataset.workspacePaneId;
    if (!candidatePaneId || !paneElementsRef.current.has(candidatePaneId)) {
      return null;
    }

    const paneRect = paneElement.getBoundingClientRect();

    const tabBarElement =
      pointedElement.closest<HTMLElement>("[data-workspace-tab-bar]") ?? null;
    const pointerOverTabBar = Boolean(tabBarElement && paneElement.contains(tabBarElement));
    const tabRects =
      pointerOverTabBar && tabBarElement
        ? [...tabBarElement.querySelectorAll<HTMLElement>("[data-workspace-tab-key]")]
            .filter((element) => paneElement.contains(element))
            .map((element) => ({
              key: element.dataset.workspaceTabKey ?? "",
              left: element.getBoundingClientRect().left,
              width: element.getBoundingClientRect().width,
            }))
            .filter((tabRect) => tabRect.key.length > 0)
        : [];

    return resolveWorkspaceSurfacePaneDropIntent({
      candidatePaneId,
      draggedKey: drag.tabKey,
      paneId: drag.paneId,
      paneRect: {
        bottom: paneRect.bottom,
        height: paneRect.height,
        left: paneRect.left,
        right: paneRect.right,
        top: paneRect.top,
        width: paneRect.width,
      },
      pointerOverTabBar,
      pointerX: drag.pointerX,
      pointerY: drag.pointerY,
      tabRects,
    });
  }, []);

  const handleTabDrag = useCallback(
    (drag: WorkspaceSurfaceTabDrag | null) => {
      if (!drag) {
        setActiveTabDrag(null);
        return;
      }

      const intent = resolveDropIntent(drag);
      setActiveTabDrag({ drag, intent });
    },
    [resolveDropIntent],
  );

  const handleTabDragCommit = useCallback(
    (drag: WorkspaceSurfaceTabDrag) => {
      const intent = resolveDropIntent(drag);
      setActiveTabDrag(null);
      if (!intent) {
        return;
      }

      if (intent.kind === "reorder") {
        const visibleTabKeys = (visibleTabsByPaneId[intent.paneId] ?? []).map((tab) => tab.key);
        onSetPaneTabOrder(
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
      );
    },
    [onMoveTabToPane, onSetPaneTabOrder, resolveDropIntent, visibleTabsByPaneId],
  );

  const renderNode = useCallback(
    (node: WorkspacePaneNode): ReactNode => {
      if (node.kind === "split") {
        return (
          <WorkspaceSurfaceSplitNode
            direction={node.direction}
            onSetSplitRatio={onSetSplitRatio}
            ratio={node.ratio}
            splitId={node.id}
          >
            {[renderNode(node.first), renderNode(node.second)]}
          </WorkspaceSurfaceSplitNode>
        );
      }

      const visibleTabs = visibleTabsByPaneId[node.id] ?? [];
      const activeTabKey = resolvedActiveTabKeyByPaneId[node.id] ?? null;
      const activeTabViewState = activeTabKey ? (viewStateByTabKey[activeTabKey] ?? null) : null;
      const activeFileSessionState =
        activeTabKey && activeTabKey in fileSessionsByTabKey
          ? (fileSessionsByTabKey[activeTabKey] ?? null)
          : null;
      const isActivePane = node.id === activePaneId;
      const paneDropIntent = activeTabDrag?.intent?.paneId === node.id ? activeTabDrag.intent : null;
      const tabBarDragPreview = getWorkspaceSurfaceTabBarDragPreview(activeTabDrag, node.id);
      const isDropTargetPane =
        paneDropIntent?.kind === "insert" && paneDropIntent.surface === "body";

      return (
        <section
          key={node.id}
          ref={(element) => setPaneElement(node.id, element)}
          className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border ${isDropTargetPane ? "border-[var(--ring)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring),transparent_50%)]" : isActivePane ? "border-[var(--ring)]/60 shadow-[0_0_0_1px_color-mix(in_srgb,var(--ring),transparent_65%)]" : "border-[var(--border)]"}`}
          data-workspace-pane-id={node.id}
          onPointerDownCapture={(event) => {
            if (!isActivePane && shouldAutoSelectWorkspacePaneFromPointerTarget(event.target)) {
              onSelectPane(node.id);
            }
          }}
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)]/80 bg-[color-mix(in_srgb,var(--panel),var(--background)_28%)] py-1">
            <WorkspaceSurfaceTabBar
              activeTabKey={activeTabKey}
              dragPreview={tabBarDragPreview}
              onCloseDocumentTab={onCloseDocumentTab}
              onCloseRuntimeTab={onCloseRuntimeTab}
              onRenameRuntimeTab={onRenameRuntimeTab}
              onSelectTab={(key) => onSelectTab(node.id, key)}
              onTabDrag={handleTabDrag}
              onTabDragCommit={handleTabDragCommit}
              paneId={node.id}
              visibleTabs={visibleTabs}
            />
            <SurfaceLaunchActions
              actions={surfaceActions}
              onLaunch={(request) => onLaunchSurface(node.id, request)}
              onOpenLauncher={() => onOpenLauncher(node.id)}
            />
            <div className="flex shrink-0 items-center gap-px pr-3">
              <PaneControlButton label="Split Right" onClick={() => onSplitPane(node.id, "row")}>
                <SplitRightIcon />
              </PaneControlButton>
              <PaneControlButton label="Split Down" onClick={() => onSplitPane(node.id, "column")}>
                <SplitDownIcon />
              </PaneControlButton>
              {paneCount > 1 ? (
                <PaneControlButton label="Close Pane" onClick={() => onClosePane(node.id)}>
                  <ClosePaneIcon />
                </PaneControlButton>
              ) : null}
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <WorkspaceSurfacePanels
              activeFileSessionState={activeFileSessionState}
              activeTabKey={activeTabKey}
              activeTabViewState={activeTabViewState}
              activeTerminalId={
                activeTabKey?.startsWith("terminal:") ? activeTabKey.slice("terminal:".length) : null
              }
              activity={activity}
              creatingSelection={creatingSelection}
              documents={documents}
              hasVisibleTabs={visibleTabs.length > 0}
              onCreateTerminal={(input, launcherKey) => onCreateTerminal(input, launcherKey, node.id)}
              onFileSessionStateChange={onFileSessionStateChange}
              onOpenFile={onOpenFile}
              onOpenTerminal={(terminalId, launcherKey) =>
                onOpenTerminal(terminalId, launcherKey, node.id)
              }
              onTabViewStateChange={onTabViewStateChange}
              paneDragInProgress={activeTabDrag !== null}
              paneFocused={isActivePane}
              sessionHistory={sessionHistory}
              terminals={terminals}
              waitingForActiveRuntimeTab={waitingForRuntimePaneIds.has(node.id)}
              workspaceId={workspaceId}
            />
            <PaneDropPreview intent={paneDropIntent} />
          </div>
        </section>
      );
    },
    [
      activePaneId,
      activeTabDrag,
      activity,
      creatingSelection,
      documents,
      fileSessionsByTabKey,
      onCloseDocumentTab,
      onClosePane,
      onCloseRuntimeTab,
      onCreateTerminal,
      onFileSessionStateChange,
      onLaunchSurface,
      onMoveTabToPane,
      onOpenFile,
      onOpenLauncher,
      onOpenTerminal,
      onRenameRuntimeTab,
      onSelectPane,
      onSelectTab,
      onSetPaneTabOrder,
      onSetSplitRatio,
      onSplitPane,
      onTabViewStateChange,
      paneCount,
      resolvedActiveTabKeyByPaneId,
      setPaneElement,
      sessionHistory,
      surfaceActions,
      terminals,
      visibleTabsByPaneId,
      viewStateByTabKey,
      waitingForRuntimePaneIds,
      workspaceId,
      handleTabDragCommit,
      handleTabDrag,
    ],
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 overflow-hidden">{renderNode(rootPane)}</div>
      {activeTabDrag && draggedTab ? (
        <WorkspaceSurfaceTabDragGhost drag={activeTabDrag.drag} tab={draggedTab} />
      ) : null}
    </>
  );
}

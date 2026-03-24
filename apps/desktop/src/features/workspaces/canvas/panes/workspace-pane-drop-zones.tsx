import { clampSplitRatio, getSplitRatioBounds } from "@/lib/panel-layout";
import type { WorkspacePaneTabDrag } from "@/features/workspaces/canvas/tabs/workspace-pane-tab-bar";
import type { WorkspaceTabPlacement } from "@/features/workspaces/canvas/workspace-canvas-tabs";

const MIN_WORKSPACE_PANE_SIZE = 240;
const PANE_DROP_EDGE_ZONE_RATIO = 0.22;

export interface WorkspacePaneInsertTarget {
  kind: "insert";
  paneId: string;
  placement: WorkspaceTabPlacement | null;
  surface: "body" | "tab-bar";
  targetKey: string | null;
}

export interface WorkspacePaneSplitTarget {
  kind: "split";
  paneId: string;
  splitDirection: "column" | "row";
  splitPlacement: "after" | "before";
  splitRatio: number;
}

export type WorkspacePaneDropIntent =
  | WorkspacePaneInsertTarget
  | WorkspacePaneSplitTarget
  | {
      kind: "reorder";
      paneId: string;
      placement: WorkspaceTabPlacement;
      targetKey: string;
    };

export interface WorkspacePaneRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface WorkspacePaneTabRect {
  key: string;
  left: number;
  width: number;
}

export interface WorkspacePaneDropGeometry {
  bodyRect?: WorkspacePaneRect;
  paneId: string;
  paneRect: WorkspacePaneRect;
  tabBarRect?: WorkspacePaneRect;
  tabRects?: readonly WorkspacePaneTabRect[];
}

interface ResolveWorkspacePaneDropTargetInput {
  bodyRect: WorkspacePaneRect;
  candidatePaneId: string;
  draggedKey: string;
  paneId: string;
  pointerOverTabBar: boolean;
  tabRects?: readonly WorkspacePaneTabRect[];
  pointerX: number;
  pointerY: number;
}

interface ResolveWorkspacePaneDropIntentFromGeometryInput {
  draggedKey: string;
  paneGeometries: readonly WorkspacePaneDropGeometry[];
  paneId: string;
  pointerX: number;
  pointerY: number;
}

interface WorkspacePaneEdgeTarget {
  distance: number;
  splitDirection: "column" | "row";
  splitPlacement: "after" | "before";
}

export interface WorkspacePaneResolvedDropState {
  hoveredPaneId: string | null;
  intent: WorkspacePaneDropIntent | null;
}

export interface WorkspacePaneActiveTabDropState {
  drag: WorkspacePaneTabDrag;
  hoveredPaneId: string | null;
  intent: WorkspacePaneDropIntent | null;
  paneGeometries: readonly WorkspacePaneDropGeometry[];
}

type WorkspacePaneBodyDropZone = "bottom" | "center" | "left" | "right" | "top";

function rectContainsPoint(
  rect: Pick<WorkspacePaneRect, "bottom" | "left" | "right" | "top">,
  pointerX: number,
  pointerY: number,
): boolean {
  return (
    pointerX >= rect.left &&
    pointerX <= rect.right &&
    pointerY >= rect.top &&
    pointerY <= rect.bottom
  );
}

function getWorkspacePaneSplitRatio(
  bodyRect: WorkspacePaneRect,
  splitDirection: "column" | "row",
  splitPlacement: "after" | "before",
): number {
  const containerSize = splitDirection === "row" ? bodyRect.width : bodyRect.height;
  const bounds = getSplitRatioBounds(containerSize, MIN_WORKSPACE_PANE_SIZE);
  if (bounds.minRatio === bounds.maxRatio) {
    return bounds.minRatio;
  }

  const maxNewPaneSize = Math.max(MIN_WORKSPACE_PANE_SIZE, containerSize - MIN_WORKSPACE_PANE_SIZE);
  const preferredNewPaneSize = Math.min(
    Math.max(MIN_WORKSPACE_PANE_SIZE, Math.round(containerSize * 0.42)),
    maxNewPaneSize,
  );
  const newPaneRatio = clampSplitRatio(preferredNewPaneSize / containerSize, bounds);
  return splitPlacement === "before" ? newPaneRatio : 1 - newPaneRatio;
}

export function resolveWorkspacePaneTabStripDropTarget({
  draggedKey,
  pointerX,
  tabRects,
}: {
  draggedKey: string;
  pointerX: number;
  tabRects: readonly WorkspacePaneTabRect[];
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

export function resolveWorkspacePaneDropIntent({
  bodyRect,
  candidatePaneId,
  draggedKey,
  paneId,
  pointerOverTabBar,
  tabRects = [],
  pointerX,
  pointerY,
}: ResolveWorkspacePaneDropTargetInput): WorkspacePaneDropIntent | null {
  if (pointerOverTabBar) {
    const stripTarget = resolveWorkspacePaneTabStripDropTarget({
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

  if (
    pointerX < bodyRect.left ||
    pointerX > bodyRect.right ||
    pointerY < bodyRect.top ||
    pointerY > bodyRect.bottom
  ) {
    return null;
  }

  if (bodyRect.width <= 0 || bodyRect.height <= 0) {
    return null;
  }

  const relativePointerX = (pointerX - bodyRect.left) / bodyRect.width;
  const relativePointerY = (pointerY - bodyRect.top) / bodyRect.height;
  const edgeTargets: WorkspacePaneEdgeTarget[] = [
    {
      distance: relativePointerY,
      splitDirection: "column",
      splitPlacement: "before",
    },
    {
      distance: 1 - relativePointerY,
      splitDirection: "column",
      splitPlacement: "after",
    },
    {
      distance: relativePointerX,
      splitDirection: "row",
      splitPlacement: "before",
    },
    {
      distance: 1 - relativePointerX,
      splitDirection: "row",
      splitPlacement: "after",
    },
  ];
  const closestEdgeTarget = edgeTargets.reduce((bestTarget, target) =>
    target.distance < bestTarget.distance ? target : bestTarget,
  );

  if (closestEdgeTarget.distance <= PANE_DROP_EDGE_ZONE_RATIO) {
    return {
      kind: "split",
      paneId: candidatePaneId,
      splitDirection: closestEdgeTarget.splitDirection,
      splitPlacement: closestEdgeTarget.splitPlacement,
      splitRatio: getWorkspacePaneSplitRatio(
        bodyRect,
        closestEdgeTarget.splitDirection,
        closestEdgeTarget.splitPlacement,
      ),
    };
  }

  return candidatePaneId !== paneId
    ? {
        kind: "insert",
        paneId: candidatePaneId,
        placement: null,
        surface: "body",
        targetKey: null,
      }
    : null;
}

export function resolveWorkspacePaneDropIntentFromGeometry({
  draggedKey,
  paneGeometries,
  paneId,
  pointerX,
  pointerY,
}: ResolveWorkspacePaneDropIntentFromGeometryInput): WorkspacePaneDropIntent | null {
  return resolveWorkspacePaneDropStateFromGeometry({
    draggedKey,
    paneGeometries,
    paneId,
    pointerX,
    pointerY,
  }).intent;
}

export function resolveWorkspacePaneDropStateFromGeometry({
  draggedKey,
  paneGeometries,
  paneId,
  pointerX,
  pointerY,
}: ResolveWorkspacePaneDropIntentFromGeometryInput): WorkspacePaneResolvedDropState {
  const candidatePane = paneGeometries.find(
    (geometry) =>
      (geometry.tabBarRect && rectContainsPoint(geometry.tabBarRect, pointerX, pointerY)) ||
      (geometry.bodyRect && rectContainsPoint(geometry.bodyRect, pointerX, pointerY)) ||
      (!geometry.bodyRect && rectContainsPoint(geometry.paneRect, pointerX, pointerY)),
  );
  if (!candidatePane) {
    return {
      hoveredPaneId: null,
      intent: null,
    };
  }

  const pointerOverTabBar = candidatePane.tabBarRect
    ? rectContainsPoint(candidatePane.tabBarRect, pointerX, pointerY)
    : false;
  const bodyRect = candidatePane.bodyRect ?? candidatePane.paneRect;

  return {
    hoveredPaneId: pointerOverTabBar ? null : candidatePane.paneId,
    intent: resolveWorkspacePaneDropIntent({
      bodyRect,
      candidatePaneId: candidatePane.paneId,
      draggedKey,
      paneId,
      pointerOverTabBar,
      pointerX,
      pointerY,
      tabRects: pointerOverTabBar ? candidatePane.tabRects : [],
    }),
  };
}

function getWorkspacePaneBodyDropZoneClipPath(zone: WorkspacePaneBodyDropZone): string {
  const edgeZonePercent = Math.round(PANE_DROP_EDGE_ZONE_RATIO * 1000) / 10;
  const trailingEdgePercent = 100 - edgeZonePercent;

  switch (zone) {
    case "top":
      return `polygon(0% 0%, 100% 0%, ${trailingEdgePercent}% ${edgeZonePercent}%, ${edgeZonePercent}% ${edgeZonePercent}%)`;
    case "bottom":
      return `polygon(${edgeZonePercent}% ${trailingEdgePercent}%, ${trailingEdgePercent}% ${trailingEdgePercent}%, 100% 100%, 0% 100%)`;
    case "left":
      return `polygon(0% 0%, ${edgeZonePercent}% ${edgeZonePercent}%, ${edgeZonePercent}% ${trailingEdgePercent}%, 0% 100%)`;
    case "right":
      return `polygon(${trailingEdgePercent}% ${edgeZonePercent}%, 100% 0%, 100% 100%, ${trailingEdgePercent}% ${trailingEdgePercent}%)`;
    case "center":
      return `polygon(${edgeZonePercent}% ${edgeZonePercent}%, ${trailingEdgePercent}% ${edgeZonePercent}%, ${trailingEdgePercent}% ${trailingEdgePercent}%, ${edgeZonePercent}% ${trailingEdgePercent}%)`;
  }
}

function getWorkspacePaneBodyActiveDropZone(
  intent: WorkspacePaneDropIntent | null,
): WorkspacePaneBodyDropZone | null {
  if (!intent || intent.kind === "reorder") {
    return null;
  }

  if (intent.kind === "insert" && intent.surface === "body") {
    return "center";
  }

  if (intent.kind !== "split") {
    return null;
  }

  if (intent.splitDirection === "row") {
    return intent.splitPlacement === "before" ? "left" : "right";
  }

  return intent.splitPlacement === "before" ? "top" : "bottom";
}

export function WorkspacePaneDropOverlay({
  activeDrag,
}: {
  activeDrag: WorkspacePaneActiveTabDropState | null;
}) {
  if (!activeDrag) {
    return null;
  }

  const hoveredPane = activeDrag.hoveredPaneId
    ? (activeDrag.paneGeometries.find((geometry) => geometry.paneId === activeDrag.hoveredPaneId) ??
      null)
    : null;
  const hoveredBodyRect = hoveredPane?.bodyRect ?? null;
  if (!hoveredBodyRect) {
    return null;
  }

  const activeZone = getWorkspacePaneBodyActiveDropZone(activeDrag.intent);
  const dropZones: WorkspacePaneBodyDropZone[] = [
    "top",
    "right",
    "bottom",
    "left",
    ...(activeDrag.drag.paneId === hoveredPane?.paneId ? [] : (["center"] as const)),
  ];

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div
        data-workspace-pane-drop-overlay={hoveredPane?.paneId}
        className="absolute rounded-[18px] border border-[var(--ring)]/55 shadow-[0_0_0_1px_var(--ring)]/30"
        style={{
          height: hoveredBodyRect.height,
          left: hoveredBodyRect.left,
          top: hoveredBodyRect.top,
          width: hoveredBodyRect.width,
        }}
      >
        {dropZones.map((zone) => {
          const isActiveZone = activeZone === zone;
          return (
            <div
              key={zone}
              data-workspace-pane-drop-zone={zone}
              data-workspace-pane-drop-zone-active={isActiveZone ? "true" : "false"}
              className={`absolute inset-0 rounded-[inherit] transition-[background-color,opacity,transform] duration-100 ease-out ${
                isActiveZone ? "bg-[var(--ring)]/18 opacity-100" : "bg-[var(--ring)]/6 opacity-85"
              }`}
              style={{ clipPath: getWorkspacePaneBodyDropZoneClipPath(zone) }}
            />
          );
        })}
      </div>
    </div>
  );
}

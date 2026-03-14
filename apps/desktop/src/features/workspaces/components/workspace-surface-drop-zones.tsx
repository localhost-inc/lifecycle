import { clampSplitRatio, getSplitRatioBounds } from "../../../lib/panel-layout";
import type { WorkspaceSurfaceTabDrag } from "./workspace-surface-tab-bar";
import type { WorkspaceTabPlacement } from "./workspace-surface-tabs";

const MIN_WORKSPACE_PANE_SIZE = 240;
const PANE_DROP_EDGE_ZONE_RATIO = 0.22;

export interface WorkspaceSurfacePaneInsertTarget {
  kind: "insert";
  paneId: string;
  placement: WorkspaceTabPlacement | null;
  surface: "body" | "tab-bar";
  targetKey: string | null;
}

export interface WorkspaceSurfacePaneSplitTarget {
  kind: "split";
  paneId: string;
  splitDirection: "column" | "row";
  splitPlacement: "after" | "before";
  splitRatio: number;
}

export type WorkspaceSurfacePaneDropIntent =
  | WorkspaceSurfacePaneInsertTarget
  | WorkspaceSurfacePaneSplitTarget
  | {
      kind: "reorder";
      paneId: string;
      placement: WorkspaceTabPlacement;
      targetKey: string;
    };

export interface WorkspaceSurfacePaneRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface WorkspaceSurfacePaneTabRect {
  key: string;
  left: number;
  width: number;
}

export interface WorkspaceSurfacePaneDropGeometry {
  bodyRect?: WorkspaceSurfacePaneRect;
  paneId: string;
  paneRect: WorkspaceSurfacePaneRect;
  tabBarRect?: WorkspaceSurfacePaneRect;
  tabRects?: readonly WorkspaceSurfacePaneTabRect[];
}

interface ResolveWorkspaceSurfacePaneDropTargetInput {
  bodyRect: WorkspaceSurfacePaneRect;
  candidatePaneId: string;
  draggedKey: string;
  paneId: string;
  pointerOverTabBar: boolean;
  tabRects?: readonly WorkspaceSurfacePaneTabRect[];
  pointerX: number;
  pointerY: number;
}

interface ResolveWorkspaceSurfacePaneDropIntentFromGeometryInput {
  draggedKey: string;
  paneGeometries: readonly WorkspaceSurfacePaneDropGeometry[];
  paneId: string;
  pointerX: number;
  pointerY: number;
}

interface WorkspaceSurfacePaneEdgeTarget {
  distance: number;
  splitDirection: "column" | "row";
  splitPlacement: "after" | "before";
}

export interface WorkspaceSurfaceResolvedPaneDropState {
  hoveredPaneId: string | null;
  intent: WorkspaceSurfacePaneDropIntent | null;
}

export interface WorkspaceSurfaceActiveTabDropState {
  drag: WorkspaceSurfaceTabDrag;
  hoveredPaneId: string | null;
  intent: WorkspaceSurfacePaneDropIntent | null;
  paneGeometries: readonly WorkspaceSurfacePaneDropGeometry[];
}

type WorkspaceSurfacePaneBodyDropZone = "bottom" | "center" | "left" | "right" | "top";

function rectContainsPoint(
  rect: Pick<WorkspaceSurfacePaneRect, "bottom" | "left" | "right" | "top">,
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
  bodyRect: WorkspaceSurfacePaneRect,
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
  bodyRect,
  candidatePaneId,
  draggedKey,
  paneId,
  pointerOverTabBar,
  tabRects = [],
  pointerX,
  pointerY,
}: ResolveWorkspaceSurfacePaneDropTargetInput): WorkspaceSurfacePaneDropIntent | null {
  if (
    pointerX < bodyRect.left ||
    pointerX > bodyRect.right ||
    pointerY < bodyRect.top ||
    pointerY > bodyRect.bottom
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

  if (bodyRect.width <= 0 || bodyRect.height <= 0) {
    return null;
  }

  const relativePointerX = (pointerX - bodyRect.left) / bodyRect.width;
  const relativePointerY = (pointerY - bodyRect.top) / bodyRect.height;
  const edgeTargets: WorkspaceSurfacePaneEdgeTarget[] = [
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

export function resolveWorkspaceSurfacePaneDropIntentFromGeometry({
  draggedKey,
  paneGeometries,
  paneId,
  pointerX,
  pointerY,
}: ResolveWorkspaceSurfacePaneDropIntentFromGeometryInput): WorkspaceSurfacePaneDropIntent | null {
  return resolveWorkspaceSurfacePaneDropStateFromGeometry({
    draggedKey,
    paneGeometries,
    paneId,
    pointerX,
    pointerY,
  }).intent;
}

export function resolveWorkspaceSurfacePaneDropStateFromGeometry({
  draggedKey,
  paneGeometries,
  paneId,
  pointerX,
  pointerY,
}: ResolveWorkspaceSurfacePaneDropIntentFromGeometryInput): WorkspaceSurfaceResolvedPaneDropState {
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
    intent: resolveWorkspaceSurfacePaneDropIntent({
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

function getWorkspaceSurfacePaneBodyDropZoneClipPath(
  zone: WorkspaceSurfacePaneBodyDropZone,
): string {
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

function getWorkspaceSurfacePaneBodyActiveDropZone(
  intent: WorkspaceSurfacePaneDropIntent | null,
): WorkspaceSurfacePaneBodyDropZone | null {
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

export function WorkspaceSurfacePaneDropOverlay({
  activeDrag,
}: {
  activeDrag: WorkspaceSurfaceActiveTabDropState | null;
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

  const activeZone = getWorkspaceSurfacePaneBodyActiveDropZone(activeDrag.intent);
  const dropZones: WorkspaceSurfacePaneBodyDropZone[] = [
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
        className="absolute rounded-[18px] border border-[color-mix(in_srgb,var(--ring),transparent_45%)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--ring),transparent_70%)]"
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
                isActiveZone
                  ? "bg-[color-mix(in_srgb,var(--ring),transparent_82%)] opacity-100"
                  : "bg-[color-mix(in_srgb,var(--ring),transparent_94%)] opacity-85"
              }`}
              style={{ clipPath: getWorkspaceSurfacePaneBodyDropZoneClipPath(zone) }}
            />
          );
        })}
      </div>
    </div>
  );
}

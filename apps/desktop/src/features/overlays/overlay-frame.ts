import type { HostedOverlayAnchor, HostedOverlayPlacement } from "./overlay-contract";

export interface OverlayViewport {
  height: number;
  width: number;
}

export interface HostedOverlayFrame {
  left: number;
  maxHeight: number;
  side: "bottom" | "top";
  top: number;
  width: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveAlignedLeft(
  anchor: HostedOverlayAnchor,
  align: HostedOverlayPlacement["align"],
  width: number,
): number {
  switch (align) {
    case "center":
      return anchor.left + anchor.width / 2 - width / 2;
    case "end":
      return anchor.left + anchor.width - width;
    default:
      return anchor.left;
  }
}

export function computeHostedOverlayFrame({
  anchor,
  placement,
  viewport,
}: {
  anchor: HostedOverlayAnchor;
  placement: HostedOverlayPlacement;
  viewport: OverlayViewport;
}): HostedOverlayFrame {
  const gutter = placement.gutter;
  const width = Math.min(placement.preferredWidth, Math.max(1, viewport.width - gutter * 2));
  const left = clamp(
    resolveAlignedLeft(anchor, placement.align, width),
    gutter,
    Math.max(gutter, viewport.width - gutter - width),
  );

  const availableBelow = Math.max(
    0,
    viewport.height - gutter - (anchor.top + anchor.height + placement.sideOffset),
  );
  const availableAbove = Math.max(0, anchor.top - placement.sideOffset - gutter);
  const prefersBottom = placement.side === "bottom";
  const canFitBelow = placement.estimatedHeight <= availableBelow;
  const canFitAbove = placement.estimatedHeight <= availableAbove;

  let side: "bottom" | "top";
  if (prefersBottom) {
    side = canFitBelow || availableBelow >= availableAbove ? "bottom" : "top";
  } else {
    side = canFitAbove || availableAbove > availableBelow ? "top" : "bottom";
  }

  const maxHeight = Math.max(
    0,
    Math.min(
      placement.estimatedHeight,
      side === "bottom" ? availableBelow : availableAbove,
    ),
  );

  const top =
    side === "bottom"
      ? clamp(
          anchor.top + anchor.height + placement.sideOffset,
          gutter,
          Math.max(gutter, viewport.height - gutter - maxHeight),
        )
      : clamp(
          anchor.top - placement.sideOffset - maxHeight,
          gutter,
          Math.max(gutter, viewport.height - gutter - maxHeight),
        );

  return {
    left,
    maxHeight,
    side,
    top,
    width,
  };
}

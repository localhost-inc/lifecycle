import { useEffect, useState, type RefObject } from "react";

export const OVERLAY_BOUNDARY_ATTRIBUTE = "data-overlay-boundary";
export const OVERLAY_BOUNDARY_SELECTOR = `[${OVERLAY_BOUNDARY_ATTRIBUTE}]`;

export function resolveContainedOverlayWidth({
  boundaryWidth,
  idealWidth,
  inset = 12,
}: {
  boundaryWidth: number | null;
  idealWidth: number;
  inset?: number;
}): number {
  if (boundaryWidth === null || !Number.isFinite(boundaryWidth) || boundaryWidth <= 0) {
    return idealWidth;
  }

  const insetWidth = boundaryWidth - inset * 2;
  const availableWidth = insetWidth > 0 ? insetWidth : boundaryWidth;
  return Math.max(0, Math.min(idealWidth, availableWidth));
}

export function useOverlayBoundary(anchorRef: RefObject<HTMLElement | null>): {
  element: HTMLElement | null;
  width: number | null;
} {
  const [boundary, setBoundary] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const nextBoundary = anchor?.closest<HTMLElement>(OVERLAY_BOUNDARY_SELECTOR) ?? null;
    setBoundary(nextBoundary);

    if (!nextBoundary) {
      setWidth(null);
      return;
    }

    const syncWidth = () => {
      setWidth(nextBoundary.getBoundingClientRect().width);
    };

    syncWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);
      return () => window.removeEventListener("resize", syncWidth);
    }

    const observer = new ResizeObserver(syncWidth);
    observer.observe(nextBoundary);
    return () => observer.disconnect();
  }, [anchorRef]);

  return { element: boundary, width };
}

import { useSyncExternalStore } from "react";
import type { OverlayViewport } from "./overlay-frame";

const emptyViewport: OverlayViewport = { height: 0, width: 0 };
let cachedViewportSnapshot = emptyViewport;

export function readOverlayViewportSnapshot(): OverlayViewport {
  if (typeof window === "undefined") {
    return emptyViewport;
  }

  const nextHeight = window.innerHeight;
  const nextWidth = window.innerWidth;

  if (cachedViewportSnapshot.height === nextHeight && cachedViewportSnapshot.width === nextWidth) {
    return cachedViewportSnapshot;
  }

  cachedViewportSnapshot = {
    height: nextHeight,
    width: nextWidth,
  };
  return cachedViewportSnapshot;
}

export function subscribeOverlayViewport(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const visualViewport = window.visualViewport;
  window.addEventListener("resize", onStoreChange);
  visualViewport?.addEventListener("resize", onStoreChange);

  return () => {
    window.removeEventListener("resize", onStoreChange);
    visualViewport?.removeEventListener("resize", onStoreChange);
  };
}

export function useOverlayViewport(): OverlayViewport {
  return useSyncExternalStore(
    subscribeOverlayViewport,
    readOverlayViewportSnapshot,
    readOverlayViewportSnapshot,
  );
}

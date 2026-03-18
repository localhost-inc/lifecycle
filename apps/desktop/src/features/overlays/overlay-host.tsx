import { listen, emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverlayShowPayload {
  overlayId: string;
  type: string;
  anchor: { x: number; y: number; width: number; height: number };
  side: "top" | "bottom" | "left" | "right";
  align: "start" | "center" | "end";
  props: Record<string, unknown>;
}

interface OverlayDismissPayload {
  overlayId: string;
}

interface OverlayUpdatePayload {
  overlayId: string;
  props: Record<string, unknown>;
}

interface ActiveOverlay {
  overlayId: string;
  type: string;
  anchor: OverlayShowPayload["anchor"];
  side: OverlayShowPayload["side"];
  align: OverlayShowPayload["align"];
  props: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Component registry
// ---------------------------------------------------------------------------

type OverlayComponent = React.ComponentType<{
  props: Record<string, unknown>;
  onAction: (action: string, payload?: unknown) => void;
}>;

const OVERLAY_REGISTRY: Record<string, OverlayComponent> = {};

export function registerOverlayComponent(type: string, component: OverlayComponent) {
  OVERLAY_REGISTRY[type] = component;
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

function computeOverlayStyle(
  anchor: ActiveOverlay["anchor"],
  side: ActiveOverlay["side"],
  align: ActiveOverlay["align"],
): React.CSSProperties {
  const gap = 8;
  const style: React.CSSProperties = { position: "absolute" };

  switch (side) {
    case "bottom":
      style.top = anchor.y + anchor.height + gap;
      break;
    case "top":
      style.bottom = window.innerHeight - anchor.y + gap;
      break;
    case "left":
      style.right = window.innerWidth - anchor.x + gap;
      break;
    case "right":
      style.left = anchor.x + anchor.width + gap;
      break;
  }

  if (side === "top" || side === "bottom") {
    switch (align) {
      case "start":
        style.left = anchor.x;
        break;
      case "center":
        style.left = anchor.x + anchor.width / 2;
        style.transform = "translateX(-50%)";
        break;
      case "end":
        style.right = window.innerWidth - anchor.x - anchor.width;
        break;
    }
  } else {
    switch (align) {
      case "start":
        style.top = anchor.y;
        break;
      case "center":
        style.top = anchor.y + anchor.height / 2;
        style.transform = "translateY(-50%)";
        break;
      case "end":
        style.bottom = window.innerHeight - anchor.y - anchor.height;
        break;
    }
  }

  return style;
}

// ---------------------------------------------------------------------------
// Hit region reporting
// ---------------------------------------------------------------------------

function reportHitRegions(overlays: Map<string, ActiveOverlay>, containerRef: React.RefObject<HTMLDivElement | null>) {
  const container = containerRef.current;
  if (!container) {
    window.webkit?.messageHandlers?.overlay?.postMessage({
      type: "hit-regions",
      regions: [],
    });
    return;
  }

  const regions: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const [id] of overlays) {
    const el = container.querySelector(`[data-overlay-id="${id}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      regions.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }

  window.webkit?.messageHandlers?.overlay?.postMessage({
    type: "hit-regions",
    regions,
  });
}

// ---------------------------------------------------------------------------
// OverlayHost
// ---------------------------------------------------------------------------

export function OverlayHost() {
  const [overlays, setOverlays] = useState<Map<string, ActiveOverlay>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;

  const dismissAll = useCallback(() => {
    setOverlays(new Map());
    window.webkit?.messageHandlers?.overlay?.postMessage({
      type: "hit-regions",
      regions: [],
    });
  }, []);

  // Expose dismiss-all for native layer to call.
  useEffect(() => {
    (window as any).__lifecycleOverlayDismissAll = dismissAll;
    return () => {
      delete (window as any).__lifecycleOverlayDismissAll;
    };
  }, [dismissAll]);

  // Listen for Tauri events from main webview.
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<OverlayShowPayload>("overlay:show", (event) => {
      setOverlays((prev) => {
        const next = new Map(prev);
        next.set(event.payload.overlayId, {
          overlayId: event.payload.overlayId,
          type: event.payload.type,
          anchor: event.payload.anchor,
          side: event.payload.side,
          align: event.payload.align,
          props: event.payload.props,
        });
        return next;
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<OverlayDismissPayload>("overlay:dismiss", (event) => {
      setOverlays((prev) => {
        const next = new Map(prev);
        next.delete(event.payload.overlayId);
        return next;
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<OverlayUpdatePayload>("overlay:update", (event) => {
      setOverlays((prev) => {
        const existing = prev.get(event.payload.overlayId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(event.payload.overlayId, {
          ...existing,
          props: { ...existing.props, ...event.payload.props },
        });
        return next;
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []);

  // Report hit regions whenever overlays change.
  useEffect(() => {
    // Defer to next frame so DOM has rendered.
    const frame = requestAnimationFrame(() => {
      reportHitRegions(overlays, containerRef);
    });
    return () => cancelAnimationFrame(frame);
  }, [overlays]);

  // Escape key dismisses all overlays.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && overlaysRef.current.size > 0) {
        dismissAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismissAll]);

  const handleAction = useCallback((overlayId: string, action: string, payload?: unknown) => {
    void emit("overlay:action", { overlayId, action, payload });
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {Array.from(overlays.values()).map((overlay) => {
        const Component = OVERLAY_REGISTRY[overlay.type];
        if (!Component) {
          return null;
        }

        const style = computeOverlayStyle(overlay.anchor, overlay.side, overlay.align);

        return (
          <div
            key={overlay.overlayId}
            data-overlay-id={overlay.overlayId}
            style={{ ...style, pointerEvents: "auto" }}
          >
            <Component
              props={overlay.props}
              onAction={(action, payload) => handleAction(overlay.overlayId, action, payload)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebKit message handler type augmentation
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        overlay?: {
          postMessage: (message: unknown) => void;
        };
      };
    };
  }
}

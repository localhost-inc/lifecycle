import { emit, listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface UseOverlayOptions {
  type: string;
  props: Record<string, unknown>;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  onAction?: (action: string, payload: unknown) => void;
}

interface UseOverlayReturn {
  show: (anchorRef: React.RefObject<HTMLElement | null>) => void;
  hide: () => void;
  isOpen: boolean;
}

export function useOverlay({
  type,
  props,
  side = "bottom",
  align = "start",
  onAction,
}: UseOverlayOptions): UseOverlayReturn {
  const reactId = useId();
  const overlayId = useRef(`overlay-${reactId}`).current;
  const [isOpen, setIsOpen] = useState(false);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  // Subscribe to actions for this overlay.
  useEffect(() => {
    const unlisten = listen<{ overlayId: string; action: string; payload: unknown }>(
      "overlay:action",
      (event) => {
        if (event.payload.overlayId !== overlayId) return;
        onActionRef.current?.(event.payload.action, event.payload.payload);
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [overlayId]);

  const show = useCallback(
    (anchorRef: React.RefObject<HTMLElement | null>) => {
      const el = anchorRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      void emit("overlay:show", {
        overlayId,
        type,
        anchor: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        side,
        align,
        props,
      });
      setIsOpen(true);
    },
    [overlayId, type, side, align, props],
  );

  const hide = useCallback(() => {
    void emit("overlay:dismiss", { overlayId });
    setIsOpen(false);
  }, [overlayId]);

  return { show, hide, isOpen };
}

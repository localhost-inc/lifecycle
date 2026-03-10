import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import type {
  HostedOverlayAction,
  HostedOverlayAnchor,
  HostedOverlayCloseRequest,
  HostedOverlayPayload,
} from "./overlay-contract";
import { logOverlayDebug } from "./overlay-debug";
import {
  closeHostedOverlay,
  getOverlayHostReady,
  initializeDesktopOverlayHost,
  isOverlayHostWindow,
  presentHostedOverlay,
  registerHostedOverlayActionHandler,
  registerHostedOverlayCloseHandler,
  subscribeOverlayHostReady,
  updateHostedOverlayAnchor,
} from "./overlay-window";

interface UseHostedOverlayOptions {
  anchorRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onAction: (action: HostedOverlayAction) => void;
  onRequestClose: () => void;
  open: boolean;
  payload: Omit<HostedOverlayPayload, "anchor" | "overlayId" | "ownerWindowLabel">;
}

function measureAnchor(element: HTMLElement): HostedOverlayAnchor {
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function useHostedOverlay({
  anchorRef,
  enabled = true,
  onAction,
  onRequestClose,
  open,
  payload,
}: UseHostedOverlayOptions): { hosted: boolean } {
  const overlayId = useId();
  const ownerWindowLabelRef = useRef<string | null>(null);
  const hostReady = useSyncExternalStore(
    subscribeOverlayHostReady,
    getOverlayHostReady,
    getOverlayHostReady,
  );
  const shouldUseHostedOverlay = enabled && isTauri() && !isOverlayHostWindow();

  if (shouldUseHostedOverlay && ownerWindowLabelRef.current === null) {
    ownerWindowLabelRef.current = getCurrentWebviewWindow().label;
  }

  useEffect(() => {
    if (!shouldUseHostedOverlay) {
      return;
    }

    logOverlayDebug("hook:init", { overlayId });
    void initializeDesktopOverlayHost().catch((error) => {
      console.error("Failed to initialize desktop overlay host:", error);
    });
  }, [overlayId, shouldUseHostedOverlay]);

  useEffect(() => {
    if (!shouldUseHostedOverlay) {
      return;
    }

    return registerHostedOverlayActionHandler(overlayId, onAction);
  }, [onAction, overlayId, shouldUseHostedOverlay]);

  useEffect(() => {
    if (!shouldUseHostedOverlay) {
      return;
    }

    return registerHostedOverlayCloseHandler(overlayId, onRequestClose);
  }, [onRequestClose, overlayId, shouldUseHostedOverlay]);

  useEffect(() => {
    if (!shouldUseHostedOverlay || !open || !hostReady) {
      if (shouldUseHostedOverlay && open && !hostReady) {
        logOverlayDebug("hook:present-blocked-waiting-for-ready", { overlayId });
      }
      return;
    }

    const ownerWindowLabel = ownerWindowLabelRef.current;
    const anchorElement = anchorRef.current;
    if (!ownerWindowLabel || !anchorElement) {
      logOverlayDebug("hook:present-blocked-missing-anchor", {
        hasAnchorElement: Boolean(anchorElement),
        overlayId,
        ownerWindowLabel,
      });
      return;
    }

    logOverlayDebug("hook:present", {
      kind: payload.kind,
      overlayId,
      ownerWindowLabel,
    });
    void presentHostedOverlay({
      ...payload,
      anchor: measureAnchor(anchorElement),
      overlayId,
      ownerWindowLabel,
    } as HostedOverlayPayload).catch((error) => {
      console.error("Failed to present hosted overlay:", error);
    });
  }, [anchorRef, hostReady, open, overlayId, payload, shouldUseHostedOverlay]);

  useEffect(() => {
    if (!shouldUseHostedOverlay || open || !ownerWindowLabelRef.current) {
      return;
    }

    const closeRequest: HostedOverlayCloseRequest = {
      overlayId,
      ownerWindowLabel: ownerWindowLabelRef.current,
    };
    logOverlayDebug("hook:close", closeRequest);
    void closeHostedOverlay(closeRequest).catch((error) => {
      console.error("Failed to close hosted overlay:", error);
    });
  }, [open, overlayId, shouldUseHostedOverlay]);

  useEffect(() => {
    if (!shouldUseHostedOverlay || !open || !hostReady) {
      return;
    }

    const ownerWindowLabel = ownerWindowLabelRef.current;
    if (!ownerWindowLabel) {
      return;
    }

    let frameId = 0;
    let lastAnchor = "";

    const tick = () => {
      const anchorElement = anchorRef.current;
      if (anchorElement) {
        const anchor = measureAnchor(anchorElement);
        const serialized = JSON.stringify(anchor);
        if (serialized !== lastAnchor) {
          lastAnchor = serialized;
          void updateHostedOverlayAnchor({
            anchor,
            overlayId,
            ownerWindowLabel,
          }).catch((error) => {
            console.error("Failed to update hosted overlay anchor:", error);
          });
        }
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [anchorRef, hostReady, open, overlayId, shouldUseHostedOverlay]);

  return { hosted: shouldUseHostedOverlay };
}

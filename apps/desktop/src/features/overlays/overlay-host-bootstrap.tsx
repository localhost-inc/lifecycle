import { useEffect } from "react";
import { initializeDesktopOverlayHost, isOverlayHostWindow } from "./overlay-window";

export function OverlayHostBootstrap() {
  useEffect(() => {
    if (isOverlayHostWindow()) {
      return;
    }

    void initializeDesktopOverlayHost().catch((error) => {
      console.error("Failed to bootstrap desktop overlay host:", error);
    });
  }, []);

  return null;
}

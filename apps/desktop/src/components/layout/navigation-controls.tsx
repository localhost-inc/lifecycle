import { isTauri } from "@tauri-apps/api/core";
import { IconButton } from "@lifecycle/ui";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useHistoryAvailability } from "../../app/history-stack";
import { detectPlatformHint, shouldInsetForWindowControls } from "./window-controls";

interface NavigationControlsProps {
  sidebarCollapsed: boolean;
}

export function NavigationControls({
  sidebarCollapsed,
}: NavigationControlsProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryAvailability();
  const shouldInset = sidebarCollapsed && shouldInsetForWindowControls(detectPlatformHint(), isTauri());

  const goBack = useCallback(() => {
    if (canGoBack) {
      navigate(-1);
    }
  }, [canGoBack, navigate]);

  const goForward = useCallback(() => {
    if (canGoForward) {
      navigate(1);
    }
  }, [canGoForward, navigate]);

  return (
    <div
      className={["flex shrink-0 items-center gap-0 px-1", shouldInset ? "pl-8" : ""].join(" ")}
      data-no-drag
    >
      <IconButton
        aria-label="Go back"
        disabled={!canGoBack}
        onClick={goBack}
      >
        ←
      </IconButton>
      <IconButton
        aria-label="Go forward"
        disabled={!canGoForward}
        onClick={goForward}
      >
        →
      </IconButton>
    </div>
  );
}

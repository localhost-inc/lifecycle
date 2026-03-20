import { isTauri } from "@tauri-apps/api/core";
import { IconButton } from "@lifecycle/ui";
import { PanelLeft } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useHistoryAvailability } from "@/app/history-stack";
import { detectPlatformHint, shouldInsetForWindowControls } from "@/components/layout/window-controls";

interface NavigationControlsProps {
  onToggleSidebar?: () => void;
  sidebarCollapsed: boolean;
}

export function NavigationControls({ onToggleSidebar, sidebarCollapsed }: NavigationControlsProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryAvailability();
  const showExpandButton = sidebarCollapsed && !!onToggleSidebar;
  const shouldInset =
    sidebarCollapsed && shouldInsetForWindowControls(detectPlatformHint(), isTauri());

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
      className={["flex shrink-0 items-center gap-1 px-1", shouldInset ? "pl-10" : ""].join(" ")}
      data-no-drag
    >
      {showExpandButton ? (
        <IconButton aria-label="Expand sidebar" onClick={onToggleSidebar} title="Expand sidebar">
          <PanelLeft size={14} strokeWidth={2} />
        </IconButton>
      ) : null}
      <IconButton aria-label="Go back" disabled={!canGoBack} onClick={goBack}>
        ←
      </IconButton>
      <IconButton aria-label="Go forward" disabled={!canGoForward} onClick={goForward}>
        →
      </IconButton>
    </div>
  );
}

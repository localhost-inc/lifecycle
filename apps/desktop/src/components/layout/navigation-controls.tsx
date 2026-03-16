import { Button } from "@lifecycle/ui";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useHistoryAvailability } from "../../app/history-stack";

interface NavigationControlsProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

export function NavigationControls({
  onToggleSidebar,
  sidebarCollapsed,
}: NavigationControlsProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryAvailability();

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
      className="ml-auto flex shrink-0 items-center gap-0 px-1"
      data-no-drag
    >
      <Button
        aria-label="Go back"
        disabled={!canGoBack}
        onClick={goBack}
        size="icon"
        variant="ghost"
      >
        ←
      </Button>
      <Button
        aria-label="Go forward"
        disabled={!canGoForward}
        onClick={goForward}
        size="icon"
        variant="ghost"
      >
        →
      </Button>
      <Button
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggleSidebar}
        size="icon"
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        variant="ghost"
      >
        {sidebarCollapsed ? (
          <PanelLeft size={14} strokeWidth={2} />
        ) : (
          <PanelLeftClose size={14} strokeWidth={2} />
        )}
      </Button>
    </div>
  );
}

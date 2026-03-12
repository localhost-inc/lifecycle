import { openUrl } from "@tauri-apps/plugin-opener";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { version } from "../../../package.json";
import { Wordmark } from "../wordmark";

interface AppStatusBarProps {
  leftSidebarCollapsed?: boolean;
  onToggleLeftSidebar?: () => void;
}

export function AppStatusBar({ leftSidebarCollapsed, onToggleLeftSidebar }: AppStatusBarProps) {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--panel)] px-3 text-[11px] text-[var(--muted-foreground)]">
      <div className="flex items-center gap-2">
        {onToggleLeftSidebar && (
          <button
            type="button"
            className="flex translate-y-px items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={onToggleLeftSidebar}
            title={leftSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {leftSidebarCollapsed ? (
              <PanelLeft size={13} strokeWidth={2} />
            ) : (
              <PanelLeftClose size={13} strokeWidth={2} />
            )}
          </button>
        )}
        <Wordmark className="h-[13px] w-auto" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="hover:text-[var(--foreground)]"
          onClick={() => openUrl("https://github.com/kylealwyn/lifecycle/issues")}
        >
          Feedback
        </button>
        <span className="font-mono opacity-50">v{version}</span>
      </div>
    </footer>
  );
}

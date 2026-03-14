import { openUrl } from "@tauri-apps/plugin-opener";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { version } from "../../../package.json";
import { Wordmark } from "../wordmark";

interface AppStatusBarProps {
  onToggleProjectNavigation?: () => void;
  projectNavigationCollapsed?: boolean;
}

export function AppStatusBar({
  onToggleProjectNavigation,
  projectNavigationCollapsed,
}: AppStatusBarProps) {
  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-2.5 text-[11px] text-[var(--muted-foreground)]"
      data-slot="app-status-bar"
    >
      <div className="flex items-center gap-1.5">
        {onToggleProjectNavigation && (
          <button
            type="button"
            className="flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={onToggleProjectNavigation}
            title={projectNavigationCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {projectNavigationCollapsed ? (
              <PanelLeft size={12} strokeWidth={2} />
            ) : (
              <PanelLeftClose size={12} strokeWidth={2} />
            )}
          </button>
        )}
        <Wordmark className="h-[11px] w-auto" />
      </div>
      <div className="flex items-center gap-2.5">
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

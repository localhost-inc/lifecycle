import { openUrl } from "@tauri-apps/plugin-opener";
import { version } from "../../../package.json";
import { Wordmark } from "../wordmark";

export function AppStatusBar() {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--panel)] px-3 text-[11px] text-[var(--muted-foreground)]">
      <div className="flex items-center gap-3">
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

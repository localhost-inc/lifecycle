import { version } from "../../../package.json";

export function AppStatusBar() {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--panel)] px-3 text-[11px] text-[var(--muted-foreground)]">
      <div className="flex items-center gap-3">
        <span className="opacity-70">
          <kbd className="font-mono">⌘K</kbd> Command Palette
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="hover:text-[var(--foreground)]"
          onClick={() => window.open("https://github.com/kylealwyn/lifecycle/issues", "_blank")}
        >
          Feedback
        </button>
        <span className="font-mono opacity-50">v{version}</span>
      </div>
    </footer>
  );
}

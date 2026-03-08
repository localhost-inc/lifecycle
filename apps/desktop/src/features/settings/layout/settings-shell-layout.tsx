import { isTauri } from "@tauri-apps/api/core";
import { Button } from "@lifecycle/ui";
import { NavLink, Outlet } from "react-router-dom";
import { version } from "../../../../package.json";
import { AppHotkeyListener } from "../../../app/app-hotkey-listener";
import {
  detectPlatformHint,
  shouldInsetSidebarHeaderForWindowControls,
} from "../../../components/layout/sidebar";
import { settingsNavItems } from "../state/settings-nav-items";

export function SettingsShellLayout() {
  const shouldInset = shouldInsetSidebarHeaderForWindowControls(
    detectPlatformHint(),
    isTauri(),
  );

  return (
    <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)]">
      <AppHotkeyListener />

      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
        <div
          className={shouldInset ? "px-3 pb-2 pt-11" : "px-3 py-2"}
          data-tauri-drag-region
        >
          <Button asChild className="w-full justify-start px-2" variant="ghost">
            <NavLink to="/">
              <span aria-hidden>←</span>
              <span>Back to app</span>
            </NavLink>
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {settingsNavItems.map((item) => (
              <li key={item.slug}>
                <NavLink
                  className={({ isActive }) =>
                    [
                      "block rounded-md px-3 py-1.5 text-sm",
                      isActive
                        ? "bg-[var(--surface-selected)] font-medium text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                    ].join(" ")
                  }
                  to={`/settings/${item.slug}`}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="px-4 py-3">
          <p className="text-[11px] text-[var(--muted-foreground)]">v{version}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-11 shrink-0" data-tauri-drag-region />
        <main className="flex min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

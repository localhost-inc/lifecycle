import { NavLink, Outlet } from "react-router-dom";
import { settingsNavItems } from "../state/settings-nav-items";

export function SettingsShellLayout() {
  return (
    <>
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <NavLink
            to="/"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          >
            <span aria-hidden>←</span>
            <span>Back to app</span>
          </NavLink>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {settingsNavItems.map((item) => (
              <li key={item.slug}>
                <NavLink
                  to={`/settings/${item.slug}`}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 bg-[var(--background)]">
        <Outlet />
      </main>
    </>
  );
}

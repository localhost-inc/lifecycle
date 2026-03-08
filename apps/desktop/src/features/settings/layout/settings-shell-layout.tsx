import { Button } from "@lifecycle/ui";
import { NavLink, Outlet } from "react-router-dom";
import { settingsNavItems } from "../state/settings-nav-items";

export function SettingsShellLayout() {
  return (
    <>
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <Button asChild className="w-full justify-start px-2" variant="ghost">
            <NavLink to="/">
              <span aria-hidden>←</span>
              <span>Back to app</span>
            </NavLink>
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {settingsNavItems.map((item) => (
              <li key={item.slug}>
                <Button asChild className="w-full justify-start px-3" variant="ghost">
                  <NavLink
                    className={({ isActive }) =>
                      isActive ? "bg-[var(--surface-selected)] text-[var(--foreground)]" : undefined
                    }
                    to={`/settings/${item.slug}`}
                  >
                    {item.label}
                  </NavLink>
                </Button>
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

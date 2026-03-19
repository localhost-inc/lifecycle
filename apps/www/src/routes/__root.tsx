import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Logo, Wordmark } from "@lifecycle/ui";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lifecycle — One file. Every environment." },
      {
        name: "description",
        content:
          "Lifecycle turns a lifecycle.json in your repo into a running workspace — services, databases, tasks, health checks — all from a native desktop app.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  return (
    <div className="mx-auto max-w-2xl px-6">
      <header className="flex items-center justify-between gap-6 py-6">
        <a href="/" className="flex items-center gap-3 no-underline">
          <Logo size={22} />
          <Wordmark className="h-3 text-[var(--foreground)]" />
        </a>

        <nav className="flex items-center gap-5">
          <a
            href="https://github.com/localhost-inc/lifecycle/tree/main/docs/reference/lifecycle-json.md"
            className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            Docs
          </a>
          <a
            href="https://github.com/localhost-inc/lifecycle"
            className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            GitHub
          </a>
        </nav>
      </header>

      <Outlet />

      <footer className="border-t border-[var(--border)] py-8 text-sm text-[var(--muted-foreground)]">
        <div className="flex flex-wrap gap-5 font-mono text-xs uppercase tracking-[0.14em]">
          <a href="https://github.com/localhost-inc/lifecycle/tree/main/docs/reference/lifecycle-json.md" className="transition-colors hover:text-[var(--foreground)]">Manifest spec</a>
          <a href="https://github.com/localhost-inc/lifecycle/tree/main/docs/vision.md" className="transition-colors hover:text-[var(--foreground)]">Vision</a>
          <a href="https://github.com/localhost-inc/lifecycle" className="transition-colors hover:text-[var(--foreground)]">Source</a>
        </div>
      </footer>
    </div>
  );
}

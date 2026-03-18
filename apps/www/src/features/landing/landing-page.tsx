import { Logo, buttonVariants } from "@lifecycle/ui";

const manifestSnippet = `{
  "workspace": {
    "setup": [
      { "name": "install", "command": "bun install --frozen-lockfile" }
    ]
  },
  "environment": {
    "postgres": {
      "kind": "service",
      "runtime": "image",
      "image": "postgres:16-alpine",
      "health_check": { "kind": "container", "timeout_seconds": 45 }
    },
    "migrate": {
      "kind": "task",
      "depends_on": ["postgres"],
      "command": "bun run db:migrate"
    },
    "web": {
      "kind": "service",
      "runtime": "process",
      "depends_on": ["migrate"],
      "command": "bun run dev",
      "port": 3000,
      "health_check": { "kind": "http", "timeout_seconds": 30 }
    }
  }
}`;

export function LandingPage() {
  return (
    <main className="pb-24 pt-16 sm:pt-24">
      {/* Hero */}
      <section className="flex flex-col items-start">
        <Logo animate size={48} className="text-[var(--foreground)]" />

        <h1 className="mt-10 text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          One file.
          <br />
          Every environment.
          <br />
          <span className="text-[var(--muted-foreground)]">Always reproducible.</span>
        </h1>

        <p className="mt-6 max-w-lg text-lg leading-relaxed text-[var(--muted-foreground)]">
          Lifecycle turns a{" "}
          <code className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--foreground)]">
            lifecycle.json
          </code>{" "}
          in your repo into a running workspace — services, databases, tasks, health
          checks — all from a native desktop app. No Docker Compose. No "works on my
          machine."
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="https://github.com/localhost-inc/lifecycle/releases"
            className={buttonVariants({ size: "lg", variant: "primary" })}
          >
            Download for Mac
          </a>
          <a
            href="https://github.com/localhost-inc/lifecycle"
            className={buttonVariants({ size: "lg", variant: "secondary" })}
          >
            View source
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-28">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          How it works
        </p>

        <div className="mt-8 grid gap-10 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Define</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Commit a{" "}
              <code className="font-mono text-[var(--foreground)]">lifecycle.json</code>{" "}
              to your repo. Services, tasks, and health checks — declared once, version-controlled forever.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Launch</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Open the project in Lifecycle. Your entire environment boots in the right
              order with dependency-aware orchestration and real health checks.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Develop</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Terminal, service logs, live previews, and agent harnesses — all in one
              surface. Every teammate gets the same environment from the same file.
            </p>
          </div>
        </div>
      </section>

      {/* Manifest */}
      <section className="mt-28">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          The manifest
        </p>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--muted-foreground)]">
          Everything your workspace needs to run, in one checked-in file. Postgres,
          migrations, dev server — declared as a dependency graph with health gates.
        </p>
        <pre className="mt-6">
          <code>{manifestSnippet}</code>
        </pre>
      </section>

      {/* Principles */}
      <section className="mt-28">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Principles
        </p>

        <div className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Local-first</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              No account required. No network dependency. Your workspaces run on your
              machine, under your control.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Desktop-native</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Not a CLI wrapper in a browser. A real desktop app with real system
              integration — fast, responsive, always there.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Agent-agnostic</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Infrastructure for where agents run, not which agent you use. Claude,
              Codex, or your own — Lifecycle is the harness.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Cloud when ready</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Shared previews and team collaboration are a planned extension — not a
              prerequisite for getting work done today.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-28 border-t border-[var(--border)] pt-12">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
          Stop configuring. Start building.
        </h2>
        <p className="mt-3 text-base leading-relaxed text-[var(--muted-foreground)]">
          Add a manifest to your repo and never explain your dev setup again.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://github.com/localhost-inc/lifecycle/releases"
            className={buttonVariants({ size: "lg", variant: "primary" })}
          >
            Download for Mac
          </a>
          <a
            href="https://github.com/localhost-inc/lifecycle/tree/main/docs/reference/lifecycle-json.md"
            className={buttonVariants({ size: "lg", variant: "secondary" })}
          >
            Read the manifest spec
          </a>
        </div>
      </section>
    </main>
  );
}

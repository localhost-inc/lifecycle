import { highlight } from "sugar-high";

const btnBase =
  "inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-4 transition-colors duration-150";
const btnPrimary = `${btnBase} bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90`;
const btnSecondary = `${btnBase} border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]`;

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

const features = [
  {
    name: "Native terminal",
    description:
      "Built on libghostty. GPU-accelerated rendering with full keyboard and mouse support.",
  },
  {
    name: "Split panes",
    description:
      "Horizontal and vertical splits. Terminals, files, logs, and previews side by side.",
  },
  {
    name: "Service dependency graph",
    description:
      "Services and tasks boot in dependency order with health checks. Postgres before migrations before your dev server.",
  },
  {
    name: "Live service logs",
    description:
      "Stream stdout and stderr from every service in your environment. Filter, search, and pin.",
  },
  {
    name: "Git surface",
    description:
      "Branches, diffs, and pull requests without leaving the app. Stage, commit, and push from the sidebar.",
  },
  {
    name: "Preview URLs",
    description:
      "Every service with a port gets a shareable preview URL. Hot-reloading included.",
  },
  {
    name: "Agent sessions",
    description:
      "Any coding agent gets the same environment your team uses. Claude, Codex, or your own toolchain.",
  },
  {
    name: "Local-first",
    description:
      "No sign-in required. Your machine, your state, your speed. Cloud is an upgrade, not a prerequisite.",
  },
  {
    name: "Cloud fork",
    description:
      "Fork any local environment to cloud. Shared terminals, shareable URLs, and team visibility.",
  },
  {
    name: "Open source",
    description: "MIT licensed. Read the code, fork it, contribute.",
  },
];

export function LandingPage() {
  return (
    <main className="pb-20 pt-8 sm:pt-16">
      {/* Hero */}
      <section>
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Where teams and agents
          <br />
          <span className="text-[var(--muted-foreground)]">
            collaborate on code.
          </span>
        </h1>

        <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--muted-foreground)]">
          Lifecycle is a native desktop app for running, sharing, and
          collaborating on development environments. One manifest in your repo.
          Deterministic dependency graph. Local-first — no accounts required.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="https://github.com/localhost-inc/lifecycle/releases" className={btnPrimary}>
            Download for Mac
          </a>
          <a href="https://github.com/localhost-inc/lifecycle" className={btnSecondary}>
            View source
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="mt-24">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Features
        </p>
        <ul className="mt-5 space-y-3">
          {features.map((feature) => (
            <li key={feature.name} className="text-sm leading-relaxed text-[var(--muted-foreground)]">
              <span className="font-semibold text-[var(--foreground)]">
                {feature.name}
              </span>{" "}
              — {feature.description}
            </li>
          ))}
        </ul>
      </section>

      {/* Manifest */}
      <section className="mt-24">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          lifecycle.json
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Commit a{" "}
          <code className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--foreground)]">
            lifecycle.json
          </code>{" "}
          to your repo. Lifecycle reads the dependency graph and boots your stack
          in order.
        </p>

        <pre className="mt-5">
          <code dangerouslySetInnerHTML={{ __html: highlight(manifestSnippet) }} />
        </pre>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
          Services, tasks, health checks, dependency ordering. Process or
          container runtime. No Docker Compose. No shell scripts.
        </p>
      </section>

      {/* CTA */}
      <section className="mt-24 border-t border-[var(--border)] pt-8">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--foreground)]">
          Start quickly. Recover predictably. Share confidently.
        </h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="https://github.com/localhost-inc/lifecycle/releases" className={btnPrimary}>
            Download for Mac
          </a>
          <a href="https://github.com/localhost-inc/lifecycle" className={btnSecondary}>
            View source
          </a>
        </div>
      </section>
    </main>
  );
}

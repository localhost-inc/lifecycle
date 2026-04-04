import { highlight } from "sugar-high";

const btnBase =
  "inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-4 transition-colors duration-150";
const btnPrimary = `${btnBase} bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90`;
const btnSecondary = `${btnBase} border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]`;

const manifestSnippet = `{
  "workspace": {
    "prepare": [
      {
        "name": "install",
        "command": "bun install --frozen-lockfile",
        "timeout_seconds": 300
      }
    ]
  },
  "environment": {
    "api": {
      "kind": "service",
      "runtime": "process",
      "command": "bun run dev",
      "cwd": "apps/control-plane",
      "startup_timeout_seconds": 30,
      "health_check": {
        "kind": "http",
        "url": "http://\${LIFECYCLE_SERVICE_API_ADDRESS}/health",
        "timeout_seconds": 5
      }
    },
    "web": {
      "kind": "service",
      "runtime": "process",
      "command": "bun run dev",
      "cwd": "apps/web",
      "depends_on": ["api"]
    }
  }
}`;

const features = [
  {
    name: "Small distributable",
    description:
      "One CLI on PATH. It works from the repo root or inside the checkout you already have.",
  },
  {
    name: "Manifest contract",
    description:
      "lifecycle.json keeps prepare steps, services, tasks, and health checks in one durable repo contract.",
  },
  {
    name: "Repo scaffolding",
    description:
      "Generate a valid starter from the repo's existing dev scripts with lifecycle repo init.",
  },
  {
    name: "Bootstrap command",
    description: "Run filesystem-level setup straight from lifecycle.json with lifecycle prepare.",
  },
  {
    name: "Machine-readable output",
    description:
      "Humans get quiet defaults. Agents and scripts get stable JSON from the same command surface.",
  },
  {
    name: "Agent-ready",
    description:
      "The same CLI contract works for humans in a shell and agents in an automated loop.",
  },
  {
    name: "Local-first",
    description:
      "No sign-in required. Your machine, your state, your speed. Cloud is an upgrade, not a prerequisite.",
  },
  {
    name: "Optional desktop surfaces",
    description:
      "Desktop previews and richer UI can layer on top, but the repo contract starts with the CLI.",
  },
];

export function LandingPage() {
  return (
    <main className="pb-20 pt-8 sm:pt-16">
      {/* Hero */}
      <section>
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Meet developers
          <br />
          <span className="text-[var(--muted-foreground)]">where they already work.</span>
        </h1>

        <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--muted-foreground)]">
          One manifest in your repo. Lifecycle starts with a small CLI distributable and a{" "}
          <code className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--foreground)]">
            lifecycle.json
          </code>{" "}
          contract in the repo. Deterministic setup, typed service orchestration, agent-friendly
          JSON, and optional desktop surfaces layered on top.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="https://github.com/localhost-inc/lifecycle/releases" className={btnPrimary}>
            Install CLI
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
            <li
              key={feature.name}
              className="text-sm leading-relaxed text-[var(--muted-foreground)]"
            >
              <span className="font-semibold text-[var(--foreground)]">{feature.name}</span> —{" "}
              {feature.description}
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
          to your repo. Lifecycle reads the repo contract directly: prepare steps, services, and
          dependency edges live in source control instead of shell glue.
        </p>

        <pre className="mt-5">
          <code dangerouslySetInnerHTML={{ __html: highlight(manifestSnippet) }} />
        </pre>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
          One file for setup and service topology. The CLI uses it directly, and any richer surface
          can build on the same contract.
        </p>
      </section>

      {/* CTA */}
      <section className="mt-24 border-t border-[var(--border)] pt-8">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--foreground)]">
          One manifest. One CLI. Optional surfaces on top.
        </h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="https://github.com/localhost-inc/lifecycle/releases" className={btnPrimary}>
            Install CLI
          </a>
          <a href="https://github.com/localhost-inc/lifecycle" className={btnSecondary}>
            View source
          </a>
        </div>
      </section>
    </main>
  );
}

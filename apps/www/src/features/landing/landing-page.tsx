import { buttonVariants } from "@lifecycle/ui";
import { highlight } from "sugar-high";

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
    <main className="pb-24 pt-12 sm:pt-20">
      {/* Hero */}
      <section>
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          One file.
          <br />
          Every environment.
          <br />
          <span className="text-[var(--muted-foreground)]">Always reproducible.</span>
        </h1>

        <p className="mt-5 max-w-lg text-lg leading-relaxed text-[var(--muted-foreground)]">
          Your environments shouldn&apos;t be a wiki page and forty minutes of tribal
          knowledge. Lifecycle reads a{" "}
          <code className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--foreground)]">
            lifecycle.json
          </code>{" "}
          from your repo and boots the whole thing — services, databases, health
          checks — in dependency order. Same file from dev to production. No Docker
          Compose. No accounts. A native desktop app.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
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
      <section className="mt-24">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          How it works
        </p>
        <p className="mt-1.5 text-base leading-relaxed text-[var(--muted-foreground)]">
          Commit this to your repo. Lifecycle does the rest.
        </p>

        <pre className="mt-5">
          <code dangerouslySetInnerHTML={{ __html: highlight(manifestSnippet) }} />
        </pre>

        <p className="mt-5 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
          Postgres boots. Migrations wait for a healthy database. The dev server waits
          for migrations. Dev, staging, production — same file, same result.
        </p>
      </section>

      {/* CTA */}
      <section className="mt-24 border-t border-[var(--border)] pt-10">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
          The whole lifecycle. One file.
        </h2>
        <div className="mt-6 flex flex-wrap gap-3">
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
    </main>
  );
}

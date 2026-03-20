# Lifecycle

Lifecycle is a desktop-first workspace runtime for local-first software work. This repository is a Bun + Turborepo monorepo containing the Tauri desktop app, a local API scaffold, the in-flight landing-page app, and shared runtime/contracts/UI packages.

## Status

Lifecycle is under active development. The current milestone is M4: local workspace environment controls and preview/service lifecycle work. Cloud, auth, organization, preview, and PR workflows are documented but not yet shipped. See [docs/plan.md](./docs/plan.md) for the live milestone board and [`.skills/reference--vision/SKILL.md`](./.skills/reference--vision/SKILL.md) for the product direction.

This repository is public and source-available for evaluation, discussion, and limited contribution. It is not released under an OSI-approved open source license. Read [LICENSE](./LICENSE), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md) before reusing or contributing to the code.

## What Exists Today

1. A Tauri desktop app (`apps/desktop`) for local-first workspace operations
2. A Bun API scaffold (`apps/api`)
3. A landing-page surface (`apps/www`) under active development
4. Shared packages for contracts, runtime abstractions, CLI surface, and UI primitives

The desktop app currently renders a project shell with project-scoped page tabs and workspace-scoped interiors. Cross-milestone workspace, shell, runtime, preview, and vocabulary contracts live in the matching reference skills under [`.skills/reference--*/SKILL.md`](./.skills/).

## Prerequisites

1. Bun `>=1.3.10`
2. A Node-compatible development environment for TypeScript tooling
3. Rust toolchain (`cargo`) for desktop Rust tests and Tauri backend builds
4. Tauri system prerequisites for your OS
5. Optional: GitHub CLI (`gh`) if you want local desktop dev auth/session resolution

## Quick Start

```bash
git clone https://github.com/localhost-inc/lifecycle.git
cd lifecycle
bun install
bun run qa
bun run dev
```

Desktop development uses the calmer Tauri loop by default: frontend edits hot reload in place, while Rust and other Tauri-native changes require restarting the desktop dev command. Use `bun --filter @lifecycle/desktop run dev:watch` when you explicitly want the older auto-relaunch behavior.

Optional pre-commit hook setup:

```bash
git config core.hooksPath .githooks
```

## Common Commands

From repo root:

1. `bun run format` - apply formatting across app and package sources
2. `bun run format:check` - verify formatting without rewriting files
3. `bun run lint` - run workspace lint checks
4. `bun run typecheck` - run workspace type checks
5. `bun run test` - run JS/TS tests across workspaces
6. `bun run test:rust` - run desktop Rust tests
7. `bun run qa` - run the default quality gate (`qa:js` + Rust tests)
8. `bun run build` - run workspace builds
9. `bun run dev` - run the checked-in app dev loops (desktop + api + www)

Desktop-specific dev loops:

1. `bun --filter @lifecycle/desktop run dev` - launch the desktop shell once with Vite HMR; restart manually after Rust or Tauri-native changes
2. `bun --filter @lifecycle/desktop run dev:watch` - opt into the older Tauri auto-restart loop for native changes
3. `bun --filter @lifecycle/api run dev` - run the API scaffold on `http://localhost:8787`
4. `bun --filter @lifecycle/www run dev` - run the landing page on `http://localhost:3000`

## Repository Layout

```text
apps/
  api/          Bun API scaffold
  desktop/      Tauri app (Rust backend + React webview)
  www/          Landing page app
packages/
  cli/          `lifecycle` CLI package scaffold
  config/       Shared TypeScript config presets
  contracts/    Shared domain contracts and manifest parsing/validation
  runtime/      ControlPlane and WorkspaceRuntime contracts plus local/cloud adapters
  ui/           Shared UI primitives and theme tokens
.skills/
  reference--*/ Canonical product, runtime, UI, and infra contracts
docs/
  plan.md       Milestone status and program-level tracking
  milestones/   Milestone implementation contracts
  backlog/      Deferred product/workspace ideas
  expansion/    Deferred product surfaces beyond the active milestones
AGENTS.md       Engineering workflow, quality bar, and review rules
vendor/
  ghostty.lock  Pinned upstream Ghostty revision used for native desktop embedding
```

## Documentation Map

Start here:

1. [Vision](./.skills/reference--vision/SKILL.md) for product direction and V1 boundaries
2. [Vocabulary](./.skills/reference--vocabulary/SKILL.md) for canonical shell, project, and workspace terms
3. [Brand](./.skills/reference--brand/SKILL.md) for voice and visual identity
4. [Plan](./docs/plan.md) for high-level milestone tracking
5. [Milestones](./docs/milestones) for detailed implementation contracts and acceptance scenarios
6. [Reference Skills](./.skills/) for cross-milestone contracts
7. [AGENTS.md](./AGENTS.md) for engineering workflow and review expectations
8. [Backlog](./docs/backlog) and [Expansion](./docs/expansion) for intentionally deferred work

## Desktop App Icon

The desktop app icon source of truth lives at `apps/desktop/src-tauri/app-icon.svg`.

Regenerate the checked-in Tauri icon bundle with:

```bash
cd apps/desktop && bun run icon:generate
```

This refreshes the generated files under `apps/desktop/src-tauri/icons`, which `apps/desktop/src-tauri/tauri.conf.json` uses for desktop bundling.

## Contributing

Lifecycle is currently maintainer-led. Small fixes, docs improvements, and tightly scoped bug reports are welcome. For anything broad, read [CONTRIBUTING.md](./CONTRIBUTING.md) and align on direction before writing a large patch.

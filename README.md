# Lifecycle

hi

Lifecycle is a CLI-first workspace runtime for local-first software work. `lifecycle.json` is the project contract, the `lifecycle` CLI is the primary control surface, and desktop or cloud surfaces can layer on top when they add value. This repository is a Bun + Turborepo monorepo containing the Tauri desktop app, the CLI packages, a local API scaffold, the in-flight landing-page app, and shared runtime/contracts/UI packages.

## Status

Lifecycle is under active development. The current active milestone contract is M4: local workspace environment controls and preview/service lifecycle work. The repo now also ships an initial CLI-first slice around `lifecycle.json`, including standalone `lifecycle repo init` and `lifecycle prepare` flows. The canonical CLI taxonomy is `project -> workspace -> stack -> service`, with the current shipped commands treated as transitional precursors to that interface. Broader CLI control, cloud, and first-party harness work remains tracked in [docs/plans](./docs/plans). See [docs/milestones/README.md](./docs/milestones/README.md) for the active milestone set, [docs/reference/vision.md](./docs/reference/vision.md) for the product direction, and [docs/plans/local-cli.md](./docs/plans/local-cli.md) for the command contract.

This repository is public and source-available for evaluation, discussion, and limited contribution. It is not released under an OSI-approved open source license. Read [LICENSE](./LICENSE), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md) before reusing or contributing to the code.

## What Exists Today

1. A Tauri desktop app (`apps/desktop`) for local-first workspace operations
2. A Bun CLI (`packages/cli`) plus command framework (`packages/cmd`) centered on `lifecycle.json`
3. A Bun API scaffold (`apps/api`)
4. A landing-page surface (`apps/www`) under active development
5. Shared packages for contracts, runtime abstractions, storage, workspace policy, and UI primitives

The desktop app currently renders a project shell with project-scoped page tabs and workspace-scoped interiors. Cross-milestone workspace, shell, runtime, preview, and vocabulary contracts live in the matching reference docs under [docs/reference/](./docs/reference/).

## CLI Interface

The documented CLI noun model is:

1. `project` - checked-in project contract and `lifecycle.json` scaffold/read
2. `workspace` - concrete working instance of a project
3. `stack` - live runnable graph inside a workspace
4. `service` - one named node inside the stack
5. `context` - aggregate machine-readable read

The target command tree starts from:

```bash
lifecycle project init
lifecycle workspace create
lifecycle workspace prepare
lifecycle workspace status
lifecycle stack run
lifecycle stack status
lifecycle service list
lifecycle context
```

The checked-in CLI is still converging on that taxonomy. Today `lifecycle repo init` and `lifecycle prepare` are the shipped precursors to `lifecycle project init` and `lifecycle workspace prepare`.

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
  agents/       First-party agent orchestration contracts and adapter interfaces
  auth/         Shared auth helpers and contracts
  cli/          `lifecycle` CLI package
  cmd/          Filesystem-based command framework used by the CLI
  config/       Shared TypeScript config presets
  contracts/    Shared domain contracts and manifest parsing/validation
  db/           Shared database server and persistence helpers
  environment/  Environment client contracts and runtime types
  store/        Shared control-plane query/mutation layer
  ui/           Shared UI primitives and theme tokens
  workspace/    Workspace policy and host-aware workspace client contracts
docs/
  milestones/   Active milestone implementation contracts
  archive/      Historical milestone specs and retired docs
  reference/    Canonical product, runtime, UI, and infra contracts
  plans/        Execution plans outside the main milestone board
  expansion/    Deferred product surfaces beyond the active milestones
AGENTS.md       Engineering workflow, quality bar, and review rules
vendor/
  ghostty.lock  Pinned upstream Ghostty revision used for native desktop embedding
```

## Documentation Map

Start here:

1. [Vision](./docs/reference/vision.md) for product direction and V1 boundaries
2. [Journey](./docs/reference/journey.md) for the narrative from local CLI use to remote collaboration and cloud handoff
3. [Vocabulary](./docs/reference/vocabulary.md) for canonical shell, project, and workspace terms
4. [Brand](./docs/reference/brand.md) for voice and visual identity
5. [Milestones](./docs/milestones/README.md) for the active milestone set and archive boundary
6. [Milestones](./docs/milestones) for detailed implementation contracts and acceptance scenarios
7. [Reference Docs](./docs/reference/) for cross-milestone contracts
8. [AGENTS.md](./AGENTS.md) for engineering workflow and review expectations
9. [Plans](./docs/plans/README.md) and [Expansion](./docs/expansion) for tracked future work outside the active milestone set

## Desktop App Icon

The desktop app icon source of truth lives at `apps/desktop/src-tauri/app-icon.svg`.

Regenerate the checked-in Tauri icon bundle with:

```bash
cd apps/desktop && bun run icon:generate
```

This refreshes the generated files under `apps/desktop/src-tauri/icons`, which `apps/desktop/src-tauri/tauri.conf.json` uses for desktop bundling.

## Contributing

Lifecycle is currently maintainer-led. Small fixes, docs improvements, and tightly scoped bug reports are welcome. For anything broad, read [CONTRIBUTING.md](./CONTRIBUTING.md) and align on direction before writing a large patch.

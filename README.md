# Lifecycle

Lifecycle is a Bun + Turborepo monorepo for a desktop-first workspace runtime.

The current implementation includes:

1. A Tauri desktop app (`apps/desktop`) for local-first workspace operations.
2. A worker scaffold (`apps/worker`).
3. Shared packages for contracts, runtime abstractions, CLI surface, and UI primitives.

For product direction, read [docs/vision.md](./docs/vision.md).

## Prerequisites

1. Bun `>=1.3.10`
2. Node-compatible development environment (for TypeScript tooling)
3. Rust toolchain (`cargo`) for desktop Rust tests and Tauri backend builds
4. Tauri system prerequisites for your OS

## Quick Start

```bash
git clone <repo-url>
cd lifecycle
bun install
bun run qa
bun run dev
```

Desktop development now uses the calmer Tauri loop by default: frontend edits hot reload in place, while Rust and other Tauri-native changes require restarting the desktop dev command. Use `bun --filter @lifecycle/desktop run dev:watch` when you explicitly want the old auto-relaunch behavior.

Optional pre-commit hook setup:

```bash
git config core.hooksPath .githooks
```

## Repository Layout

```text
apps/
  desktop/      Tauri app (Rust backend + React webview)
  worker/       Worker scaffold and tests
packages/
  cli/          `lifecycle` CLI package scaffold
  config/       Shared TypeScript config presets
  contracts/    Shared domain contracts and manifest parsing/validation
  runtime/      WorkspaceProvider interfaces and local provider stubs
  ui/           Shared UI primitives and theme tokens
vendor/
  ghostty.lock  Pinned upstream Ghostty revision used for native desktop embedding
docs/
  vision.md             Product vision and direction
  plan.md     Milestone status and task checklists
  milestones/           Milestone implementation contracts
  reference/            Cross-milestone reference specs
  BRAND.md              Brand and voice guidelines
```

## Common Commands

From repo root:

1. `bun run dev` - run active app dev loops (desktop + worker)
2. `bun run lint` - run workspace lint checks
3. `bun run typecheck` - run workspace type checks
4. `bun run test` - run JS/TS tests across workspaces
5. `bun run test:rust` - run desktop Rust tests
6. `bun run qa` - run default quality gate (`qa:js` + Rust tests)
7. `bun run build` - run workspace builds

Desktop-specific dev loops:

1. `bun --filter @lifecycle/desktop run dev` - launch the desktop shell once with Vite HMR; restart manually after Rust or Tauri-native changes
2. `bun --filter @lifecycle/desktop run dev:watch` - opt into the old Tauri auto-restart loop for native changes

## Desktop App Icon

The desktop app icon source of truth lives at `apps/desktop/src-tauri/app-icon.svg`.

Regenerate the checked-in Tauri icon bundle with:

```bash
bun --filter @lifecycle/desktop run icon:generate
```

This refreshes the generated files under `apps/desktop/src-tauri/icons`, which `apps/desktop/src-tauri/tauri.conf.json` uses for desktop bundling.

## Package Scripts

Most workspaces expose a common script set:

1. `build`
2. `lint`
3. `typecheck`
4. `test`

Run a workspace command with Bun filters, for example:

```bash
bun --filter @lifecycle/contracts run test
```

## Documentation Map

Use this split:
1. Execution plan = high-level milestone tracking.
2. Milestones = detailed implementation contracts and test scenarios.

1. [Vision](./docs/vision.md)
2. [Plan](./docs/plan.md)
3. [Milestones](./docs/milestones)
4. [Reference Specs](./docs/reference)
5. [Learnings](./docs/learnings)

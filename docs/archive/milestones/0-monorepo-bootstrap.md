# Milestone 0: "I can clone, install, and run the monorepo in under 10 minutes"

> Prerequisites: none  
> Introduces: Bun workspaces monorepo, shared toolchain, CI baseline, execution scaffolding
> Archived: historical milestone spec retained for context only.

## Goal

Create a modern Bun-first monorepo foundation so every next milestone can ship against stable tooling, consistent package boundaries, and reproducible local/CI execution.

## What You Build

1. Bun workspace monorepo structure for apps and shared packages.
2. Root scripts for `dev`, `build`, `test`, `typecheck`, `lint`, and `format`.
3. Shared TypeScript configuration and strict type-checking defaults.
4. Repository quality gates (lint/type/test) locally and in CI.
5. Initial package boundaries aligned to Lifecycle's platform model.

## Repository Contracts

### Package Manager and Runtime

1. Bun is the canonical package manager and script runner.
2. `bun.lock` is committed and treated as authoritative.
3. Root scripts are stable entry points; subpackages expose focused scripts only.

### Monorepo Layout (Initial)

```
apps/
  desktop/      # Tauri shell + React UI
  api/          # Bun API scaffold
  www/          # Static landing page
packages/
  cli/          # Lifecycle CLI surface
  contracts/    # Shared types/schemas/state contracts
  config/       # Shared build/tooling config
  runtime/      # Workspace runtime primitives/provider interfaces
docs/
```

### Tooling Baseline

1. TypeScript strict mode enabled by default.
2. One lint/format stack (OXC: `oxlint` + `oxfmt`) chosen and documented.
3. One test runner baseline (`bun:test`) available from root and package level.
4. CI runs the same root quality gates used locally.

## Task Checklist

### 1) Initialize Monorepo

- [x] Create root `package.json` with Bun workspaces and unified scripts.
- [x] Add `bun.lock` and pin Bun version expectations.
- [x] Create root folders (`apps`, `packages`, `docs`) with starter package manifests.

### 2) Establish Shared Tooling

- [x] Add shared `packages/config/tsconfig.base.json` and package-level `tsconfig.json` inheritance.
- [x] Configure lint + format tooling and root commands.
- [x] Configure test runner baseline and root `test` command.
- [x] Configure `typecheck` command across all workspaces.

### 3) Seed Runtime-Oriented Packages

- [x] Add `packages/contracts` with initial shared types (`workspace`, `workspace_service`, error envelope).
- [x] Add `packages/backend` and `packages/workspace` with `Backend` and `Workspace` interface placeholders.
- [x] Add `packages/cli` command scaffold with no-op `lifecycle --help`.
- [x] Add `apps/desktop`, `apps/api`, and `apps/www` starter scaffolds.

### 4) Developer Experience

- [x] Add `.editorconfig`, `.gitignore`, and optional pre-commit hooks.
- [x] Add `README` setup section for clone/install/run/test in <10 minutes.
- [x] Ensure `bun run dev` starts a minimal happy-path development loop.

### 5) CI Baseline

- [x] Add CI workflow for install + lint + typecheck + test on pull requests.
- [x] Ensure CI uses Bun and workspace-aware caching.
- [x] Fail fast on type or lint regression.

## Exit Gate

1. Fresh clone -> `bun install` succeeds without manual fixes.
2. `bun run lint`, `bun run typecheck`, and `bun run test` pass at root.
3. `bun run dev` starts scaffolded development targets successfully.
4. CI mirrors local quality gates and passes on the default branch.
5. Directory/package structure supports M1 implementation without restructuring.

## Test Scenarios

```bash
git clone <repo>
cd lifecycle
bun install
bun run lint
bun run typecheck
bun run test
bun run dev
```

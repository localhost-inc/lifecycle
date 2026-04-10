# Plan: CLI

> Status: active plan
> Depends on: [Architecture](../reference/architecture.md), [TUI](../reference/tui.md), [Cloud](./cloud.md), [Terminals](./terminals.md)
> Plan index: [docs/plans/README.md](./README.md)

This document owns the user-facing CLI contract. It defines the noun model, command families, output rules, and runtime authority boundaries for `lifecycle`.

It does not own desktop window management, browser surfaces, or app-local RPC details. Those belong to client-specific docs.

## Goal

The `lifecycle` CLI is the canonical control surface for Lifecycle.

It should work for:

1. developers in a terminal
2. scripts and automation
3. tools and harnesses running inside a workspace
4. cloud and local workflows using the same grammar

The CLI must stay small, scriptable, and bridge-first.

## Principles

1. The CLI is the primary product surface.
2. Runtime reads and mutations are bridge-first.
3. Local workflows do not require auth or network.
4. Singular nouns stay stable across local and cloud.
5. Default output is human-readable; `--json` is the stable machine contract.
6. The CLI should not grow app-specific UI verbs.
7. Cloud extends the same CLI grammar instead of inventing a second control surface.
8. Terminal operations are first-class and layer onto the same workspace model. See [Terminals](./terminals.md).

## Canonical Noun Model

1. `project` — the durable checked-in contract on disk; owns `lifecycle.json`
2. `repo` — repository-scoped setup and repository linkage
3. `workspace` — a concrete working instance of a project
4. `terminal` — one interactive terminal inside a workspace runtime
5. `stack` — the live runnable graph inside a workspace
6. `service` — one named node inside the stack
7. `context` — one-shot aggregate machine-readable view

Rules:

1. Namespaces stay singular: `project`, `repo`, `workspace`, `terminal`, `stack`, `service`.
2. Plurality lives in verbs or arguments: `service list`, `terminal list`, `service start api web`.
3. Use `environment` for the declarative graph in `lifecycle.json`; use `stack` for the live operational surface.
4. Use `workspace` for materialization and durable identity; do not overload it with stack or service verbs.
5. Use `repo` for repository-scoped setup and VCS/provider linkage, not for runtime reads that belong to the workspace or terminal.
6. `workspace shell` is a convenience attach path into the workspace's default terminal, not a separate product model.

## Bridge-First Rule

The CLI is a bridge client for runtime operations.

Rules:

1. `workspace`, `terminal`, `stack`, `service`, and `context` commands ask the bridge for authoritative runtime state.
2. The CLI does not reimplement host-runtime authority in leaf commands when the bridge is available.
3. The bridge returns authoritative responses and streams lifecycle events for long-running changes.
4. Project-local manifest commands may run directly in the CLI process when no workspace runtime owner is required.
5. Cloud commands may talk to the control plane, but they still preserve the same noun model.

## Resolution Rules

Commands resolve workspace context in this order:

1. explicit flags such as `--workspace`
2. injected Lifecycle environment variables
3. cwd-based workspace detection

Required runtime environment for tools running inside a workspace:

1. `LIFECYCLE_WORKSPACE_ID`
2. `LIFECYCLE_PROJECT_ID`
3. `LIFECYCLE_TERMINAL_ID` for tools and hooks running inside a Lifecycle-managed terminal
4. `LIFECYCLE_WORKSPACE_PATH`
5. `LIFECYCLE_WORKSPACE_HOST`

Rules:

1. Common flows should not require raw ids when the caller is already inside a workspace.
2. IDs are escape hatches, not the default path.
3. Runtime activity signals emitted from inside a terminal should resolve workspace and terminal scope from injected env by default.
4. When no workspace can be resolved, the CLI fails with a typed error instead of guessing.

## Command Families

### Global

1. `lifecycle`
   - launches the TUI when no subcommand is provided
2. `lifecycle bridge start`
   - starts the bridge for the current host context
3. `lifecycle context [--json]`
   - returns a one-shot aggregate view of project, workspace, terminal, stack, service, and git facts

### Project

1. `lifecycle project init`
   - scaffold or repair `lifecycle.json`
2. `lifecycle project inspect [--json]`
   - read manifest and project-level metadata

### Repo

1. `lifecycle repo install [--check] [--json]`
   - install merge-only Lifecycle repo integrations for the current repository
   - current shipped scope: project-scoped MCP config plus project-scoped hook integration for supported harnesses
   - interactive mode prompts for the providers to configure, then installs the managed surfaces for each selected provider
2. `lifecycle repo link --project-id <id>`
   - link the repository to provider-backed collaboration authority when needed
3. `lifecycle repo status [--json]`
   - read repository linkage and install status

Rules:

1. `repo install` is the user-facing repo setup path for harness integrations.
2. `repo install` should be idempotent and safe to rerun.
3. Repo install writes repo-scoped integration files without deleting unrelated harness config; runtime activity signaling stays under `workspace activity`.
4. Repo install merges managed hook entries into project config and may add repo-local helper scripts under `.lifecycle/` when a harness needs a stable project-relative adapter.
5. Repo install should ask which providers to configure in interactive mode rather than exposing raw file targets.

### Proxy

1. `lifecycle proxy install [--dry-run] [--json]`
   - install machine-scoped clean HTTP routing for `*.lifecycle.localhost`
   - redirects local port 80 preview traffic into the Lifecycle preview proxy port
2. `lifecycle proxy status [--json]`
   - read machine-scoped preview proxy install status
3. `lifecycle proxy uninstall [--dry-run] [--json]`
   - remove machine-scoped clean HTTP preview routing

Rules:

1. `proxy install` is machine-scoped runtime setup, not repository setup.
2. `proxy install` and `proxy uninstall` may require root privileges because they modify local redirect rules.
3. `proxy status` reports whether clean HTTP is installed; preview routing should still work with an explicit proxy port when clean HTTP is absent.
4. `repo install` remains the repo-scoped harness integration path; do not overload it with machine-level preview setup.

### Workspace

1. `lifecycle workspace create [--project <id>] [--ref <branch>] [--host <local|docker|remote|cloud>]`
2. `lifecycle workspace list [--json]`
3. `lifecycle workspace status [--json]`
4. `lifecycle workspace prepare`
5. `lifecycle workspace shell [--workspace <id>]`
6. `lifecycle workspace destroy`
7. `lifecycle workspace activity emit <event> [--workspace <id>] [--terminal <id>] [--turn-id <id>] [--name <name>] [--kind <kind>] [--metadata <json>] [--json]`
8. `lifecycle workspace activity status [--json]`

Rules:

1. `workspace activity emit` is the runtime signaling path used by hook scripts and managed terminal wrappers.
2. `workspace activity emit` resolves `workspace_id` and `terminal_id` from injected env by default and only needs explicit overrides for tests or debugging.
3. `provider` may be attached as metadata, but it is not required for routing or reducer authority.
4. Event names stay semantic and dot-scoped, for example `turn.started`, `turn.completed`, `tool.started`, `tool.completed`, `waiting.started`, and `waiting.completed`.
5. `workspace activity status` is the read path for the bridge-derived terminal and workspace activity view.

### Terminal

1. `lifecycle terminal list [--json]`
2. `lifecycle terminal open [--kind <shell|claude|codex|custom>] [--title <title>]`
3. `lifecycle terminal attach [<terminal>]`
4. `lifecycle terminal close <terminal>`

Rules:

1. `workspace shell` attaches the default workspace terminal.
2. `terminal attach` targets a specific terminal record.
3. Terminal transport details stay behind the bridge/runtime contract.

### Stack

1. `lifecycle stack run`
2. `lifecycle stack stop`
3. `lifecycle stack reset`
4. `lifecycle stack status [--json]`
5. `lifecycle stack logs [--tail <n>] [--since <duration>] [--grep <pattern>] [--follow] [--json]`
6. `lifecycle stack health [--json]`

### Service

1. `lifecycle service list [--json]`
2. `lifecycle service info <service> [--json]`
3. `lifecycle service start [service...]`
4. `lifecycle service stop [service...]`
5. `lifecycle service logs <service> [--tail <n>] [--since <duration>] [--grep <pattern>] [--follow] [--json]`
6. `lifecycle service health [service...] [--json]`

### Cloud Extensions

Cloud-specific families are defined in [Cloud](./cloud.md):

1. `auth`
2. `org`
3. `pr`

Cloud-linked repo operations are defined in [Cloud](./cloud.md), but `repo` is still a general CLI namespace because repo-local install/setup is not cloud-only.

Those families must reuse the same noun model rather than introducing a second CLI grammar.

## Output Contract

Rules:

1. Every read command supports `--json`.
2. Default output is compact, quiet, and human-readable.
3. `--json` shapes are public contracts and should evolve additively only.
4. Log commands may use NDJSON when streaming is needed.
5. `context --json` is the preferred one-shot orientation read for tools and harnesses.
6. `workspace activity emit` should be quiet by default and return an accepted envelope when `--json` is requested.

## Error Contract

All command failures should resolve to typed errors with:

1. `code`
2. `message`
3. `details`
4. `suggestedAction`
5. `retryable`

Rules:

1. No silent fallbacks.
2. No hidden host switching.
3. No app-specific recovery instructions in core CLI flows.

## Explicit Non-Goals

This plan does not define:

1. desktop window, tab, or browser control
2. browser screenshots or visual capture commands
3. client-specific RPC transports
4. provider-specific harness launchers
5. a second local API that competes with the CLI

## Exit Gate

This plan is successful when all of the following are true:

1. `project`, `repo`, `workspace`, `terminal`, `stack`, `service`, and `context` form one coherent CLI grammar.
2. Common workspace commands resolve context automatically from cwd or injected env.
3. Runtime operations are bridge-first across local and cloud.
4. `workspace shell` and `terminal attach` compose cleanly instead of representing different models.
5. Repo-scoped harness setup has one primary entry point in `repo install`.
6. `--json` reads are stable enough for tools and harnesses to consume directly.

## Test Scenarios

```text
cd into worktree -> lifecycle workspace status -> resolves workspace without --workspace
cd into worktree -> lifecycle stack status --json -> returns structured stack state
cd into worktree -> lifecycle terminal list --json -> returns terminal records for the workspace
lifecycle project init -> creates or repairs lifecycle.json
lifecycle repo install -> installs repo-scoped MCP and hook integration for supported harnesses
lifecycle proxy install -> installs clean HTTP lifecycle.localhost routing for this machine
lifecycle workspace prepare -> runs prepare for the current workspace
lifecycle workspace shell -> attaches the default workspace terminal
lifecycle terminal open --kind shell -> creates another terminal in the same workspace
lifecycle terminal attach <terminal> -> attaches the requested terminal without leaking transport details
lifecycle workspace activity emit turn.started -> resolves workspace and terminal from env and records terminal activity without requiring provider flags
lifecycle workspace activity status --json -> returns terminal-scoped activity plus the derived workspace aggregate
lifecycle stack logs --tail 20 -> returns readable aggregate logs
lifecycle service info api --json -> returns structured service facts
lifecycle context --json -> returns one-shot orientation payload
not inside a workspace -> lifecycle stack status -> typed workspace resolution error
```

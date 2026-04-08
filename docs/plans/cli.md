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
2. `workspace` — a concrete working instance of a project
3. `terminal` — one interactive terminal inside a workspace runtime
4. `stack` — the live runnable graph inside a workspace
5. `service` — one named node inside the stack
6. `context` — one-shot aggregate machine-readable view

Rules:

1. Namespaces stay singular: `project`, `workspace`, `terminal`, `stack`, `service`.
2. Plurality lives in verbs or arguments: `service list`, `terminal list`, `service start api web`.
3. Use `environment` for the declarative graph in `lifecycle.json`; use `stack` for the live operational surface.
4. Use `workspace` for materialization and durable identity; do not overload it with stack or service verbs.
5. `workspace shell` is a convenience attach path into the workspace's default terminal, not a separate product model.

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
3. `LIFECYCLE_WORKSPACE_PATH`
4. `LIFECYCLE_WORKSPACE_HOST`

Rules:

1. Common flows should not require raw ids when the caller is already inside a workspace.
2. IDs are escape hatches, not the default path.
3. When no workspace can be resolved, the CLI fails with a typed error instead of guessing.

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

### Workspace

1. `lifecycle workspace create [--project <id>] [--ref <branch>] [--host <local|docker|remote|cloud>]`
2. `lifecycle workspace list [--json]`
3. `lifecycle workspace status [--json]`
4. `lifecycle workspace prepare`
5. `lifecycle workspace shell [--workspace <id>]`
6. `lifecycle workspace destroy`

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
3. `repo`
4. `pr`

Those families must reuse the same noun model rather than introducing a second CLI grammar.

## Output Contract

Rules:

1. Every read command supports `--json`.
2. Default output is compact, quiet, and human-readable.
3. `--json` shapes are public contracts and should evolve additively only.
4. Log commands may use NDJSON when streaming is needed.
5. `context --json` is the preferred one-shot orientation read for tools and harnesses.

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

1. `project`, `workspace`, `terminal`, `stack`, `service`, and `context` form one coherent CLI grammar.
2. Common workspace commands resolve context automatically from cwd or injected env.
3. Runtime operations are bridge-first across local and cloud.
4. `workspace shell` and `terminal attach` compose cleanly instead of representing different models.
5. `--json` reads are stable enough for tools and harnesses to consume directly.

## Test Scenarios

```text
cd into worktree -> lifecycle workspace status -> resolves workspace without --workspace
cd into worktree -> lifecycle stack status --json -> returns structured stack state
cd into worktree -> lifecycle terminal list --json -> returns terminal records for the workspace
lifecycle project init -> creates or repairs lifecycle.json
lifecycle workspace prepare -> runs prepare for the current workspace
lifecycle workspace shell -> attaches the default workspace terminal
lifecycle terminal open --kind shell -> creates another terminal in the same workspace
lifecycle terminal attach <terminal> -> attaches the requested terminal without leaking transport details
lifecycle stack logs --tail 20 -> returns readable aggregate logs
lifecycle service info api --json -> returns structured service facts
lifecycle context --json -> returns one-shot orientation payload
not inside a workspace -> lifecycle stack status -> typed workspace resolution error
```

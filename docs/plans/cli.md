# Plan: CLI

> Status: active plan
> Depends on: [Architecture](../reference/architecture.md), [Runtime Boundaries](./runtime-boundaries.md), [Cloud](./cloud.md), [Terminals](./terminals.md)
> Plan index: [docs/plans/README.md](./README.md)

This document defines the CLI we would choose if we were designing `lifecycle` from scratch for the product we are actually shipping now.

That product is:

1. a CLI-first runtime surface
2. a bundled local bridge owned by the CLI distribution
3. a desktop app that launches that bundled CLI helper
4. no first-party custom-agent runtime in the active CLI contract
5. no desktop-specific RPC path in the core CLI contract

## Goal

`lifecycle` is both:

1. the primary operator interface for local and cloud workflows
2. the single Lifecycle-owned executable shipped inside `Lifecycle.app`

The CLI should be small, scriptable, authority-driven, and easy to bundle.

## Core Product Decisions

If we were choosing again now, these would be the non-negotiable rules:

1. `lifecycle` is the only Lifecycle-owned executable artifact.
2. The bridge is a CLI-owned runtime, not a separate package boundary and not a second user-facing executable.
3. The desktop app launches the bundled CLI by absolute path and asks it to start the bridge with `lifecycle bridge start`.
4. Bare `lifecycle` should print help by default. It should not implicitly launch a TUI or another product surface.
5. The CLI does not own a first-party custom-agent UX, provider-auth UX, transcript UX, or agent-worker orchestration surface.
6. Runtime operations are bridge-first.
7. Local file and repo setup operations stay local to the CLI process.
8. Cloud commands extend the same noun model instead of introducing a second grammar.

## What The CLI Is

The CLI has three jobs.

### 1. Bootstrap

Machine-local startup and discovery for the bridge runtime.

Examples:

1. `bridge start`
2. `bridge status`
3. `bridge stop`
4. `context`

### 2. Operate

Human and automation-facing commands for repos, workspaces, terminals, stacks, and services.

Examples:

1. `project init`
2. `repo install`
3. `workspace create`
4. `workspace shell`
5. `stack status`
6. `service logs`

### 3. Package

Produce one helper payload that the desktop app can embed and run without a repo checkout.

Rules:

1. The release artifact may bundle a JS payload, Bun runtime, and required native addons.
2. That bundling detail is invisible to users; the contract remains `lifecycle`.

## What The CLI Is Not

The CLI should not be:

1. a desktop RPC shim
2. a TUI launcher by default
3. a home for first-party custom-agent commands
4. a pile of dev-only subcommands mixed into the public product grammar
5. a second runtime authority that bypasses the bridge

## Execution Modes

Every command should fit exactly one of these modes.

### Local Mode

Pure filesystem or repo setup work. No bridge required.

Examples:

1. `project init`
2. `project inspect`
3. `repo install`

### Runtime Mode

Bridge-backed runtime reads and mutations.

Examples:

1. `workspace *`
2. `terminal *`
3. `stack *`
4. `service *`
5. `context`

Rules:

1. Runtime mode always goes through the bridge client.
2. Commands may `ensureBridge()` first, but they do not reimplement host-runtime logic.

### Cloud Mode

Control-plane-backed commands that preserve the same noun model.

Examples:

1. `auth *`
2. `org *`
3. `pr *`

## Canonical Nouns

The CLI should only center a small stable noun set.

1. `project` — checked-in contract on disk
2. `repo` — repository-scoped install and linkage
3. `workspace` — concrete runtime instance
4. `terminal` — interactive terminal inside a workspace
5. `stack` — live runnable graph inside a workspace
6. `service` — one node inside the stack
7. `context` — one-shot aggregate read
8. `bridge` — bootstrap and health of the local runtime authority

Rules:

1. Namespaces stay singular.
2. Runtime activity belongs under `workspace`, `terminal`, `stack`, or `service`, not under ad hoc nouns.
3. `bridge` is an infrastructure noun, not a second product.

## Public Command Surface

If we were choosing today, the public surface would be this.

### Bootstrap

1. `lifecycle bridge start`
2. `lifecycle bridge status`
3. `lifecycle bridge stop`
4. `lifecycle context [--json]`

### Project

1. `lifecycle project init`
2. `lifecycle project inspect [--json]`

### Repo

1. `lifecycle repo install [--check] [--json]`
2. `lifecycle repo status [--json]`
3. `lifecycle repo link [--json]`

### Workspace

1. `lifecycle workspace create`
2. `lifecycle workspace list [--json]`
3. `lifecycle workspace status [--json]`
4. `lifecycle workspace shell [--json]`
5. `lifecycle workspace destroy [--json]`
6. `lifecycle workspace reset [--json]`
7. `lifecycle workspace logs [--json]`
8. `lifecycle workspace health [--json]`
9. `lifecycle workspace activity emit ...`
10. `lifecycle workspace activity status [--json]`

### Terminal

1. `lifecycle terminal list [--json]`
2. `lifecycle terminal open [--json]`
3. `lifecycle terminal attach [--json]`
4. `lifecycle terminal close [--json]`

### Stack

1. `lifecycle stack start [--json]`
2. `lifecycle stack stop [--json]`
3. `lifecycle stack status [--json]`
4. `lifecycle stack logs [--json]`
5. `lifecycle stack health [--json]`

### Service

1. `lifecycle service list [--json]`
2. `lifecycle service info [--json]`
3. `lifecycle service start [--json]`
4. `lifecycle service stop [--json]`
5. `lifecycle service logs [--json]`
6. `lifecycle service health [--json]`

### Cloud

1. `lifecycle auth *`
2. `lifecycle org *`
3. `lifecycle pr *`

## Commands We Would Not Keep

These are the commands or patterns we should treat as migration targets, not durable architecture.

1. bare `lifecycle` launching the TUI
2. `context` routed through desktop RPC
3. duplicate workspace deletion verbs like `archive`, `destroy`, and `remove`
4. `workspace run` when stack lifecycle already exists as its own noun
5. `project create` when `project init` is the clearer contract
6. public dev-only commands like `db server`, `logs bridge`, and `tmux clean`
7. any command family under `agent`

## Internal Code Architecture

From scratch, the CLI code should be split by responsibility, not by history.

Recommended shape:

```text
apps/cli/
  src/
    index.ts                 # entrypoint; help-first default
    cli/
      registry.ts            # command registry only
      runner.ts              # parse, dispatch, help, errors
      output.ts              # human/json/stream rendering helpers
      errors.ts              # typed CLI-facing errors
    clients/
      bridge/
        ensure.ts            # registration, startup, health
        client.ts            # typed HTTP client construction
        resolve.ts           # workspace/terminal scope resolution
      control-plane/
        client.ts
    commands/
      bridge/*
      context.ts
      project/*
      repo/*
      workspace/*
      terminal/*
      stack/*
      service/*
      auth/*
      org/*
      pr/*
    local/
      manifest/*
      repo-install/*
      hooks/*
    support/
      env.ts
      paths.ts
      json.ts
      process.ts
  bridge/
    src/
      domains/
        auth/*
        workspace/*
        terminal/*
        stack/*
      lib/*
    routes/*
```

Rules:

1. `src/commands/*` should stay thin.
2. Commands parse input, resolve scope, call one authority client, and render output.
3. Bridge bootstrap/discovery should live in one bridge client layer, not in random commands.
4. Desktop-specific transports should not live in the core CLI architecture.
5. Internal bridge re-export shims should disappear once imports point directly at the correct internal boundary.

## Resolution Architecture

One shared resolver should own runtime scope resolution.

Resolution order:

1. explicit flags
2. injected Lifecycle env vars
3. cwd-based repo/workspace detection

Rules:

1. Every command should use the same resolution helpers.
2. Commands should not each invent their own workspace lookup logic.
3. Failure to resolve scope should produce one typed error shape.

## Output Architecture

Every command should support one of two stable output modes.

1. human
2. `--json`

Rules:

1. Human output is compact and quiet.
2. JSON output is the automation contract.
3. Streamed logs may use line-oriented JSON or NDJSON when necessary.
4. Commands should not mix prose and machine output on stdout.

## Error Architecture

Every failure should collapse into a typed user-facing error with:

1. `code`
2. `message`
3. `details`
4. `suggestedAction`
5. `retryable`

Rules:

1. No silent fallbacks.
2. No hidden host switching.
3. No desktop-app-specific recovery text in core CLI flows.

## Packaging Architecture

The CLI packaging boundary should be explicit.

Rules:

1. The release build emits one runnable `lifecycle` helper payload.
2. The desktop app embeds that payload wholesale under `Contents/Helpers`.
3. Any native addons required by bridge-backed commands must be staged inside the helper payload.
4. Packaged CLI execution must not depend on repo-relative source layout.

## Current Mismatches

These are the concrete mismatches between the current repo and the architecture above.

1. `apps/cli/src/index.ts` still launches the TUI on bare invocation.
2. `apps/cli/src/commands/context.ts` still uses `src/desktop/rpc.ts` instead of the bridge client.
3. The public command set still includes duplicate or historical verbs.
4. Public and dev-only commands are still mixed together under one visible registry.
5. Bridge import boundaries still rely on source re-export shims under `src/bridge/*`.

## Next Implementation Slices

If we wanted to converge the current codebase onto this architecture, I would do it in this order:

1. Make bare `lifecycle` print help instead of launching the TUI.
2. Move `context` off desktop RPC and onto the bridge.
3. Hide or delete dev-only public commands that are not part of the product grammar.
4. Collapse duplicate command families to one canonical noun and one canonical verb.
5. Move shared resolution, bridge bootstrap, and output code under dedicated internal folders.
6. Keep the bridge-owned runtime under `apps/cli/src/bridge` and keep trimming stale custom-agent-era codepaths.

## Exit Gate

This plan is successful when:

1. `lifecycle` has one coherent public grammar
2. runtime operations are bridge-first
3. the desktop app depends on the CLI helper, not on a separate bridge helper or desktop RPC surface
4. the public CLI contract contains no first-party custom-agent namespace
5. the code layout mirrors the shipped boundary instead of the repo’s historical package churn

# Lifecycle Vision

Lifecycle is the control plane for development workspace lifecycle and collaborative agent work.

It gives developers a fast path from project checkout to running workspace through a small distributable CLI, then from local iteration to richer desktop or shareable cloud collaboration, without changing the runtime contract.

## Problem

Modern development environments fail in predictable ways:

1. Setup is slow and non-deterministic.
2. Runtime state drifts and becomes hard to recover.
3. Sharing in-progress work is fragile and expensive.
4. Tooling is fragmented across terminal scripts, desktop-only tools, cloud dashboards, and ad-hoc handoff steps.

Teams lose time not because they cannot write code, but because getting and keeping a healthy workspace is unreliable.

## Product Thesis

Lifecycle should make workspace operations boring:

1. A project plus `lifecycle.json` is enough to produce a reproducible workspace.
2. The `lifecycle` CLI should be the first place developers meet Lifecycle: small, distributable, scriptable, and compatible with existing terminal workflows.
3. The canonical CLI noun model is `project -> workspace -> stack -> service`, with `context` as the aggregate machine-readable read.
4. Workspace lifecycle operations (`create`, `run`, `reset`, `sleep`, `wake`, `destroy`) should be deterministic and typed.
5. Local-first operation should work without auth or network.
6. Cloud collaboration should be an upgrade path, not a prerequisite.
7. The system should be agent-agnostic infrastructure: where agents run, not which agent to use.
8. Desktop surfaces are optional accelerators, not the root contract. The project contract starts with `lifecycle.json` plus the CLI.

## Product Promise

Lifecycle aims to deliver calm velocity:

1. Start quickly.
2. Recover predictably.
3. Share confidently.
4. Hand off cleanly.

## Core V1 Loop

1. Add `lifecycle.json` to the project, or generate a starter with `lifecycle project init`.
2. Install the `lifecycle` CLI.
3. Materialize and prepare a workspace with `lifecycle workspace create` and `lifecycle workspace prepare`.
4. Operate the running graph with `lifecycle stack run`, `lifecycle stack status`, and `lifecycle service ...`.
5. Optionally open richer desktop surfaces on top of the same workspace contract.
6. Optionally sign in and fork to cloud.
7. Share preview.
8. Create PR.

The loop is intentionally local-first and CLI-first, then expands to desktop or cloud only when collaboration or richer inspection is needed.

The currently shipped CLI is a narrower precursor to that taxonomy. Today the checked-in standalone slice includes `lifecycle repo init` and `lifecycle prepare`; the target command contract is tracked in [docs/plans/local-cli.md](../plans/local-cli.md).

## Local and Cloud Model

### Local mode

1. No account required.
2. State is stored locally.
3. Workspaces are private to the machine.
4. Fastest feedback loop.

### Cloud mode

1. Enabled by sign-in.
2. Organization-scoped visibility and activity.
3. Shareable preview URLs.
4. Collaboration and handoff surface.
5. Signing in unlocks cloud capabilities, but it does not change the authority of existing local workspaces.

### Bridge: fork-to-cloud

Fork-to-cloud is the intentional handoff path from private local iteration to shareable team workspace.

The narrative version of this progression lives in [Lifecycle Journey](./journey.md).

## V1 Outcomes

A successful V1 means:

1. Net-new users can reach a running local workspace quickly.
2. Workspace lifecycle transitions are explicit, tested, and observable.
3. Workspace-native controls and raw terminal sessions are both first-class in the desktop app.
4. Cloud sharing and PR handoff work without breaking local-first flows.
5. Failures are typed with clear recovery guidance.

## Principles

1. Local-first by default.
2. Typed state machines over ad-hoc transitions.
3. Explicit provider boundaries.
4. Reproducibility over convenience shortcuts.
5. Minimal hidden behavior and no silent fallbacks.

## Non-Goals (V1)

1. Full IDE replacement.
2. Forcing cloud auth for local workflows.
3. Replacing every external agent runtime with a single Lifecycle-only engine in V1.

## Delivery Alignment

The implementation plan and contracts live in:

1. `docs/milestones/README.md`
2. `docs/milestones/*.md`
3. `docs/plans/*.md`
4. `docs/reference/*.md`
5. `AGENTS.md`

This document defines the product direction. The milestone docs, execution plans, reference docs, and engineering playbook define implementation detail, sequencing, and acceptance gates.

---
name: reference--vision
description: Product vision and strategy for product decisions or feature scoping
user-invocable: true
---

Apply the following product vision as context for the current task. Work should align with the strategic direction described here.

---

# Lifecycle Vision

Lifecycle is the control plane for development workspace lifecycle and collaborative agent work.

It gives developers a fast path from repository to running workspace, then from local iteration to shareable cloud collaboration, without changing the runtime contract.

## Problem

Modern development environments fail in predictable ways:

1. Setup is slow and non-deterministic.
2. Runtime state drifts and becomes hard to recover.
3. Sharing in-progress work is fragile and expensive.
4. Tooling is fragmented across terminal scripts, cloud dashboards, and ad-hoc handoff steps.

Teams lose time not because they cannot write code, but because getting and keeping a healthy workspace is unreliable.

## Product Thesis

Lifecycle should make workspace operations boring:

1. A project plus `lifecycle.json` is enough to produce a reproducible workspace.
2. Workspace lifecycle operations (`create`, `run`, `reset`, `sleep`, `wake`, `destroy`) should be deterministic and typed.
3. Local-first operation should work without auth or network.
4. Cloud collaboration should be an upgrade path, not a prerequisite.
5. The system should be agent-agnostic infrastructure: where agents run, not which agent to use.
6. Agent-agnostic does not mean terminal-only: Lifecycle can provide its own collaborative agent surface while keeping runtimes pluggable.

## Product Promise

Lifecycle aims to deliver calm velocity:

1. Start quickly.
2. Recover predictably.
3. Share confidently.
4. Hand off cleanly.

## Core V1 Loop

1. Open desktop app.
2. Add project.
3. Start workspace.
4. Open a workspace and work in the workspace canvas, dropping into a raw terminal when needed.
5. Optionally sign in and fork to cloud.
6. Share preview.
7. Create PR.

The loop is intentionally local-first and expands to cloud only when collaboration is needed.

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

1. `docs/plan.md`
2. `docs/milestones`
3. `docs/reference`
4. `docs/VOCABULARY.md`
5. `docs/execution`
6. `docs/BRAND.md`

This document defines the product direction. Plan, milestone, reference, vocabulary, and execution docs define implementation detail, sequencing, and acceptance gates.

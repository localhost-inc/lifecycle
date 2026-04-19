# Lifecycle Vision

Lifecycle is the terminal-native workspace runtime for software teams.

This document owns the product thesis and top-level boundaries. It should answer what Lifecycle is for, what promise it makes, and what V1 must prove. It should not restate the full system design or re-tell the local-to-cloud user journey in detail.

## Problem

Development environments fail in predictable ways:

1. Setup is slow and non-deterministic.
2. Runtime state drifts and becomes hard to recover.
3. Terminal state does not survive host changes cleanly.
4. Every harness wants its own environment setup and runtime glue.
5. Teams lose time not because they cannot write code, but because getting and keeping a healthy workspace is unreliable.

## Product Thesis

1. A project plus `lifecycle.json` is enough to produce a reproducible workspace on any supported host.
2. The `lifecycle` CLI is the primary control surface: small, distributable, scriptable.
3. The terminal is the primary interface. The TUI and native clients are terminal-first surfaces over the same runtime.
4. Workspaces run on `local`, `docker`, `remote`, or `cloud` hosts through pluggable sandbox providers.
5. Lifecycle is harness-agnostic infrastructure: it owns where shells and stacks run, not which chat UX or approval model wins.
6. Local-first operation works without auth or network. Cloud upgrades the same workspace into a hosted runtime with shell attach and an optional routed `opencode serve` endpoint.
7. Interactive shell attach and routed remote access are access patterns over the same workspace contract, not separate products.

## Product Promise

1. Start quickly: materialize a healthy workspace from the checked-in project contract.
2. Recover predictably: keep lifecycle transitions typed, explicit, and observable.
3. Keep one runtime shape across hosts: same shell, same stack, same service graph.
4. Hand off cleanly: the same workspace can be driven from a terminal or reached through a compatible routed endpoint.

## V1 Boundaries

Lifecycle V1 is:

1. local-first
2. terminal-native
3. CLI-first, with TUI and native clients as secondary terminal surfaces
4. bridge-first for runtime authority
5. harness-agnostic
6. cloud-capable through hosted workspaces, shell attach, and routed `opencode serve`

Lifecycle V1 is not:

1. a provider-specific chat product that replaces the terminal-native runtime model
2. a first-party chat surface as the center of the product
3. a full IDE replacement
4. a cloud-only product
5. a provider-specific workflow that forces one harness or one sandbox vendor

## V1 Outcomes

A successful V1 means:

1. `lifecycle.json` plus the CLI produces a running workspace on local, docker, remote, or cloud hosts.
2. A developer can shell into any workspace and keep the same terminal/runtime model across hosts.
3. A cloud workspace can expose a routed `opencode serve` endpoint without changing the workspace contract.
4. Workspace lifecycle transitions are explicit, tested, and observable across hosts.
5. The control plane manages cloud workspace lifecycle, terminal routing, routed OpenCode access, and PR workflows without becoming the runtime itself.

## Principles

1. Local-first by default.
2. Terminal-native by default.
3. Harness-agnostic infrastructure.
4. One workspace contract across local and cloud.
5. Typed state machines over ad hoc transitions.
6. Explicit host and provider boundaries.
7. No silent fallbacks.

## Relationship To Other Docs

1. [Architecture](./architecture.md) owns the system design, authority boundaries, bridge/control-plane split, and provider model.
2. [Journey](./journey.md) owns the narrative of how the product should feel from local terminal work to cloud-hosted runtime.
3. [TUI](./tui.md) owns the terminal UI contract.
4. [CLI](../plans/cli.md) owns the CLI command contract and runtime control surface.
5. [Cloud](../plans/cloud.md) owns the concrete cloud delivery plan.

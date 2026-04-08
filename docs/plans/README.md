# Plans

This directory contains tracked execution plans that are real enough to keep on paper, but not active enough to count as milestones yet.

Current plan priority: local CLI, control plane, sandbox providers, and OpenCode integration. Desktop-specific plans are not the main execution lane unless they directly unblock CLI/TUI/control-plane work.

## Current Plans

1. [Local CLI](./local-cli.md) — CLI command contract, workspace/stack/service operations, context dump
2. [Runtime Boundaries](./runtime-boundaries.md) — bridge-first package ownership, authority cleanup, and package collapse plan
3. [Mac Presentation Boundaries](./mac-presentation-boundaries.md) — native shell ownership, render-only Swift boundaries, and target-level enforcement plan
4. [Kin Cloud V1](./kin-cloud-v1.md) — auth, orgs, cloud workspace provisioning, shell attach, PR workflow
5. [Cloud Hardening](./cloud-hardening.md) — sleep/wake restore, TTL enforcement, quotas, cloud lifecycle SLOs
6. [Terminal Runtime](./terminal-runtime.md) — richer terminal runtime for desktop/web clients while preserving `workspace shell` for TUI/CLI

## Archived Plans

These plans are superseded by the current architecture direction. Retained for historical context.

1. [Agent Workspace](./agent-workspace.md) — **archived**: custom agent harness and first-party provider integrations. Superseded by OpenCode as the agent runtime. See [architecture](../reference/architecture.md).
2. [Cloud Workspaces](./cloud-workspaces.md) — **archived**: merged into Kin Cloud V1
3. [Supervisor](../archive/plans/supervisor.md) — **archived**: replaced by bridge-first runtime authority and host-local execution adapters
4. [Pane Tree Performance](./pane-tree-performance.md) — desktop-specific, deferred

## Promotion Rule

Move a plan into `docs/milestones/*` only when it becomes the primary active delivery contract for the repo. Historical milestone specs should move to `docs/archive/milestones/*` once they stop being active.

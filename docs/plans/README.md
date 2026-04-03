# Plans

This directory contains tracked execution plans that are real enough to keep on paper, but not active enough to count as milestones yet.

Current plan priority: local CLI, control plane, sandbox providers, and OpenCode integration. Desktop-specific plans are not the main execution lane unless they directly unblock CLI/TUI/control-plane work.

## Current Plans

1. [Supervisor](./supervisor.md) — per-workspace background supervisor, process management, file watching, socket protocol
2. [Local CLI](./local-cli.md) — CLI command contract, workspace/stack/service operations, context dump
3. [Kin Cloud V1](./kin-cloud-v1.md) — auth, orgs, cloud workspace provisioning, shell attach, PR workflow
4. [Cloud Hardening](./cloud-hardening.md) — sleep/wake restore, TTL enforcement, quotas, cloud lifecycle SLOs

## Archived Plans

These plans are superseded by the current architecture direction. Retained for historical context.

1. [Agent Workspace](./agent-workspace.md) — **archived**: custom agent harness and first-party provider integrations. Superseded by OpenCode as the agent runtime. See [architecture](../reference/architecture.md).
2. [Cloud Workspaces](./cloud-workspaces.md) — **archived**: merged into Kin Cloud V1
3. [Pane Tree Performance](./pane-tree-performance.md) — desktop-specific, deferred

## Promotion Rule

Move a plan into `docs/milestones/*` only when it becomes the primary active delivery contract for the repo. Historical milestone specs should move to `docs/archive/milestones/*` once they stop being active.

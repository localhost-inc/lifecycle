# Plans

This directory contains tracked execution plans that are real enough to keep on paper, but not active enough to count as milestones yet.

Current plan priority: CLI, terminals, control plane, sandbox providers, and thin OpenCode server routing for cloud workspaces. Desktop-specific plans are not the main execution lane unless they directly unblock CLI/TUI/control-plane work. Agent-surface and transcript-centric work are secondary.

## Current Plans

1. [CLI](./cli.md) — canonical CLI grammar, bridge-first runtime operations, and stable output contracts
2. [Runtime Boundaries](./runtime-boundaries.md) — bridge-first package ownership, authority cleanup, and package collapse plan
3. [Mac Presentation Boundaries](./mac-presentation-boundaries.md) — native shell ownership, render-only Swift boundaries, and target-level enforcement plan
4. [Desktop Packaging](./desktop-packaging.md) — production app bundle contract, bundled bridge and CLI runtime, and clean-machine distribution readiness
5. [Cloud](./cloud.md) — hosted workspace loop, remote shell attach, routed OpenCode endpoint, and PR workflow
6. [Cloud Hardening](./cloud-hardening.md) — sleep/wake restore, TTL enforcement, quotas, cloud lifecycle SLOs
7. [Terminals](./terminals.md) — first-class terminal runtime contract across CLI, TUI, native, web, local, and cloud

## Archived Plans

These plans are superseded by the current architecture direction. Retained for historical context.

1. [Agent Workspace](./agent-workspace.md) — **archived**: custom agent harness, transcript surface, and first-party provider integrations. Superseded by terminal-native runtime plus thin OpenCode routing. See [architecture](../reference/architecture.md).
2. [Cloud Workspaces](../archive/plans/cloud-workspaces.md) — **archived**: merged into Cloud
3. [Supervisor](../archive/plans/supervisor.md) — **archived**: replaced by bridge-first runtime authority and host-local execution adapters
4. [Pane Tree Performance](./pane-tree-performance.md) — desktop-specific, deferred

## Promotion Rule

Move a plan into `docs/milestones/*` only when it becomes the primary active delivery contract for the repo. Historical milestone specs should move to `docs/archive/milestones/*` once they stop being active.

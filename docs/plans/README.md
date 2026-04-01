# Plans

This directory contains tracked execution plans that are real enough to keep on paper, but not active enough to count as milestones yet.

## Current Plans

1. [Agent Workspace](./agent-workspace.md) — first-party harness and `agent_session` work
2. [Local CLI](./local-cli.md) — local CLI control, observability, and desktop-shell bridge boundaries
3. [Cloud Workspaces](./cloud-workspaces.md) — auth, org/repository/activity records, fork-to-cloud, previews, PRs, and shared cloud terminals
4. [Kin Cloud V1](./kin-cloud-v1.md) — the one tactical build plan for auth, orgs, customer Cloudflare, cloud workspaces, native shell/agent flow, and PR merge
5. [Cloud Hardening](./cloud-hardening.md) — sleep/wake restore, TTL enforcement, quotas, and cloud lifecycle SLOs
6. [Pane Tree Performance](./pane-tree-performance.md) — workspace pane/tab render locality, tab-switch latency, and drag-path performance

## Promotion Rule

Move a plan into `docs/milestones/*` only when it becomes the primary active delivery contract for the repo. Historical milestone specs should move to `docs/archive/milestones/*` once they stop being active.

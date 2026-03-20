# Lifecycle Plan

This document is the high-level delivery tracker for Lifecycle.

Implementation detail lives in milestone specs (`docs/milestones/*.md`).
Cross-milestone contracts live in reference skills (`.skills/reference--*/SKILL.md`).

## Doc Boundary (Important)

Use this file for:
1. Milestone status (`planned`, `in_progress`, `done`, `blocked`)
2. High-level checklists and sequencing
3. Program-level progress reporting

Do not put these in this file:
1. Entity field-level schemas
2. State transition matrices
3. API payload definitions
4. Transport/protocol implementation detail
5. Detailed command specs

Those belong in milestone or reference docs.

## How To Use This Doc

1. Update status board when milestone state changes.
2. Check/uncheck high-level milestone items as delivery moves.
3. If scope changes, update the milestone doc first, then this tracker.
4. Link implementation PRs/issues next to milestone sections when useful.

## Milestone Status Board

| Milestone | Status  | Depends On | Tracking Scope                                          | Detailed Spec |
| --------- | ------- | ---------- | ------------------------------------------------------- | ------------- |
| M0        | done    | none       | Monorepo/tooling baseline                               | [0-monorepo-bootstrap](./milestones/0-monorepo-bootstrap.md) |
| M1        | done    | M0         | Desktop shell + project import + manifest validation    | [1-desktop-shell](./milestones/1-desktop-shell.md) |
| M2        | done    | M1         | Local workspace create/start/health to `active`         | [2-local-workspaces](./milestones/2-local-workspaces.md) |
| M3        | done    | M2         | Terminal and harness runtime in workspace               | [3-terminal-runtime](./milestones/3-terminal-runtime.md) |
| M4        | in_progress | M3         | Run and control local workspace environments            | [4-workspace-environments](./milestones/4-workspace-environments.md) |
| M5        | planned | M4         | First-class local CLI                                   | [5-local-cli](./milestones/5-local-cli.md) |
| M6        | planned | M5         | Auth, cloud workspaces, previews, PR flow               | [6-cloud-workspaces](./milestones/6-cloud-workspaces.md) |
| M7        | planned | M6         | Cloud lifecycle hardening (sleep/wake, TTL, quotas)     | [7-cloud-hardening](./milestones/7-cloud-hardening.md) |

## Milestone Checklists (High-Level Only)

### M0 - Bun Monorepo Bootstrap

Detail spec: [0-monorepo-bootstrap](./milestones/0-monorepo-bootstrap.md)

- [x] Monorepo structure and package boundaries established
- [x] Shared tooling and quality gates are in place
- [x] CI mirrors local lint/type/test checks
- [x] Fresh clone developer loop works end-to-end

### M1 - App Opens, Project Added, Config Visible

Detail spec: [1-desktop-shell](./milestones/1-desktop-shell.md)

- [x] Tauri desktop shell is operational
- [x] Add-project flow imports local repositories
- [x] `lifecycle.json` validation surfaces field-level issues
- [x] Project state persists locally across app restarts

### M2 - Local Workspace Reaches Active

Detail spec: [2-local-workspaces](./milestones/2-local-workspaces.md)

- [x] Workspace + workspace-service entities are implemented
- [x] Local provider create/start flow reaches `active`
- [x] Service health gates readiness
- [x] Desktop UI renders progress and typed failures

### M3 - Terminal and Agent Runtime

Detail spec: [3-terminal-runtime](./milestones/3-terminal-runtime.md)

- [x] Terminal entity and lifecycle states are implemented
- [x] Local terminal architecture (native Ghostty desktop host) is operational
- [x] Harness launch/resume flows are integrated
- [x] Terminal tabs support native hide/detach/restore within the running desktop session
- [x] Workspace and terminal titles support inline rename plus first-prompt auto-titles
- [x] Terminal lifecycle coverage is tested

### M4 - Local Workspace Environments

Detail spec: [4-workspace-environments](./milestones/4-workspace-environments.md)

- [ ] `run`, `reset`, `sleep`, `wake`, and `destroy` flows are complete for local mode
- [ ] Local preview routing and service previews are wired
- [ ] Workspace, environment, and service lifecycle boundaries are enforced
- [x] Desktop workspace extension strip supports local environment lifecycle controls
- [ ] Local terminal sessions survive desktop app restart
- [ ] Local lifecycle round-trip behavior is tested

### M5 - First-Class CLI (Local)

Detail spec: [5-local-cli](./milestones/5-local-cli.md)

- [ ] CLI workspace context auto-detection is implemented
- [ ] Status/logs/health/context observability commands are operational
- [ ] Local workspace/environment lifecycle and terminal command surfaces are complete
- [ ] `--json` output contracts are stable for machine consumption
- [ ] CLI flows are covered by command-surface tests

### M6 - Auth, Cloud, Preview, and PR

Detail spec: [6-cloud-workspaces](./milestones/6-cloud-workspaces.md)

- [ ] Auth and organization-aware cloud data flow are implemented
- [ ] Repository linking and GitHub App integration are operational
- [ ] Fork-to-cloud and cloud-to-local flows are complete
- [ ] Preview routing/auth and share controls are production-viable
- [ ] PR creation path works from desktop and CLI surfaces
- [ ] RBAC and cloud flow tests pass

### M7 - Cloud Lifecycle Production-Ready

Detail spec: [7-cloud-hardening](./milestones/7-cloud-hardening.md)

- [ ] Cloud sleep/wake lifecycle is implemented with restore semantics
- [ ] Cloud destroy guarantees cleanup and revocation
- [ ] TTL sweeper and org quota enforcement are active
- [ ] Cloud lifecycle reliability and policy tests pass

## Backlog

Backlog items are intentionally out of milestone sequencing and should not block active milestone work.

- Lifecycle-native agent workspace, native runtime/tool architecture, and attachment-first center panel: [agent-workspace.md](./backlog/agent-workspace.md)

## Cross-Milestone Standards (Always On)

- [ ] Canonical naming uses `workspace` across all layers
- [ ] Commands, fact events, streams, hooks, and derived projections stay conceptually distinct across docs and code
- [ ] Typed error model stays aligned with `/reference--infra`
- [ ] State transitions stay aligned with `/reference--runtime`
- [ ] Event foundation and command hooks stay aligned with `/reference--runtime`
- [x] Provider boundaries stay aligned with `/reference--workspace`
- [ ] Reliability targets stay aligned with `/reference--infra`

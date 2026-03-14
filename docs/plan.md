# Lifecycle Plan

This document is the high-level delivery tracker for Lifecycle.

Implementation detail lives in milestone specs:
- `docs/milestones/*.md` for scope, contracts, architecture, and test scenarios
- `docs/reference/*.md` for shared cross-milestone contracts

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
| M0        | done    | none       | Monorepo/tooling baseline                               | [m0](./milestones/m0.md) |
| M1        | done    | M0         | Desktop shell + project import + manifest validation    | [m1](./milestones/m1.md) |
| M2        | done    | M1         | Local workspace create/start/health to `active`         | [m2](./milestones/m2.md) |
| M3        | done    | M2         | Terminal and harness runtime in workspace               | [m3](./milestones/m3.md) |
| M4        | in_progress | M3         | Run and control local workspace environments            | [m4](./milestones/m4.md) |
| M5        | planned | M4         | First-class local CLI                                   | [m5](./milestones/m5.md) |
| M6        | planned | M5         | Auth, cloud workspaces, previews, PR flow               | [m6](./milestones/m6.md) |
| M7        | planned | M6         | Cloud lifecycle hardening (sleep/wake, TTL, quotas)     | [m7](./milestones/m7.md) |

## Milestone Checklists (High-Level Only)

### M0 - Bun Monorepo Bootstrap

Detail spec: [docs/milestones/m0.md](./milestones/m0.md)

- [x] Monorepo structure and package boundaries established
- [x] Shared tooling and quality gates are in place
- [x] CI mirrors local lint/type/test checks
- [x] Fresh clone developer loop works end-to-end

### M1 - App Opens, Project Added, Config Visible

Detail spec: [docs/milestones/m1.md](./milestones/m1.md)

- [x] Tauri desktop shell is operational
- [x] Add-project flow imports local repositories
- [x] `lifecycle.json` validation surfaces field-level issues
- [x] Project state persists locally across app restarts

### M2 - Local Workspace Reaches Active

Detail spec: [docs/milestones/m2.md](./milestones/m2.md)

- [x] Workspace + workspace-service entities are implemented
- [x] Local provider create/start flow reaches `active`
- [x] Service health gates readiness
- [x] Desktop UI renders progress and typed failures

### M3 - Terminal and Agent Runtime

Detail spec: [docs/milestones/m3.md](./milestones/m3.md)

- [x] Terminal entity and lifecycle states are implemented
- [x] Local terminal architecture (native Ghostty desktop host) is operational
- [x] Harness launch/resume flows are integrated
- [x] Terminal tabs support native hide/detach/restore within the running desktop session
- [x] Workspace and terminal titles support inline rename plus first-prompt auto-titles
- [x] Terminal lifecycle coverage is tested

### M4 - Local Workspace Environments

Detail spec: [docs/milestones/m4.md](./milestones/m4.md)

- [ ] `run`, `reset`, `sleep`, `wake`, and `destroy` flows are complete for local mode
- [ ] Local preview and service exposure controls are wired
- [ ] Workspace, environment, and service lifecycle boundaries are enforced
- [ ] Desktop operations panel supports local environment lifecycle controls
- [ ] Local lifecycle round-trip behavior is tested

### M5 - First-Class CLI (Local)

Detail spec: [docs/milestones/m5.md](./milestones/m5.md)

- [ ] CLI workspace context auto-detection is implemented
- [ ] Status/logs/health/context observability commands are operational
- [ ] Local workspace/environment lifecycle and terminal command surfaces are complete
- [ ] `--json` output contracts are stable for machine consumption
- [ ] CLI flows are covered by command-surface tests

### M6 - Auth, Cloud, Preview, and PR

Detail spec: [docs/milestones/m6.md](./milestones/m6.md)

- [ ] Auth and organization-aware cloud data flow are implemented
- [ ] Repository linking and GitHub App integration are operational
- [ ] Fork-to-cloud and cloud-to-local flows are complete
- [ ] Preview routing/auth and share controls are production-viable
- [ ] PR creation path works from desktop and CLI surfaces
- [ ] RBAC and cloud flow tests pass

### M7 - Cloud Lifecycle Production-Ready

Detail spec: [docs/milestones/m7.md](./milestones/m7.md)

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
- [ ] Typed error model stays aligned with [docs/reference/errors.md](./reference/errors.md)
- [ ] State transitions stay aligned with [docs/reference/state-machines.md](./reference/state-machines.md)
- [ ] Event foundation and command hooks stay aligned with [docs/reference/events.md](./reference/events.md)
- [x] Provider boundaries stay aligned with [docs/reference/workspace-provider.md](./reference/workspace-provider.md)
- [ ] Reliability targets stay aligned with [docs/reference/slos.md](./reference/slos.md)

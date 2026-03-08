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
| M2        | done    | M1         | Local workspace create/start/health to `ready`          | [m2](./milestones/m2.md) |
| M3        | in_progress | M2     | Terminal and harness runtime in workspace               | [m3](./milestones/m3.md) |
| M5        | planned | M3         | Full local lifecycle controls                           | [m5](./milestones/m5.md) |
| M6        | planned | M5         | First-class local CLI                                   | [m6](./milestones/m6.md) |
| M7        | planned | M6         | Auth, cloud workspaces, previews, PR flow               | [m7](./milestones/m7.md) |
| M8        | planned | M7         | Cloud lifecycle hardening (sleep/wake, TTL, quotas)     | [m8](./milestones/m8.md) |

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

### M2 - Local Workspace Reaches Ready

Detail spec: [docs/milestones/m2.md](./milestones/m2.md)

- [x] Workspace + workspace-service entities are implemented
- [x] Local provider create/start flow reaches `ready`
- [x] Service health gates readiness
- [x] Desktop UI renders progress and typed failures

### M3 - Terminal and Agent Runtime

Detail spec: [docs/milestones/m3.md](./milestones/m3.md)

- [x] Terminal entity and lifecycle states are implemented
- [x] Local terminal architecture (native Ghostty on macOS, browser fallback elsewhere) is operational
- [x] Harness launch/resume flows are integrated
- [x] Terminal tabs support attach/detach/reattach and replay
- [x] Workspace and terminal titles support inline rename plus first-prompt auto-titles
- [x] Terminal lifecycle coverage is tested

### M5 - Full Local Lifecycle

Detail spec: [docs/milestones/m5.md](./milestones/m5.md)

- [ ] `run`, `reset`, `sleep`, `wake`, and `destroy` flows are complete for local mode
- [ ] Local preview and service exposure controls are wired
- [ ] Mutation locking and terminal/service interaction boundaries are enforced
- [ ] Desktop operations panel supports full local lifecycle controls
- [ ] Local lifecycle round-trip behavior is tested

### M6 - First-Class CLI (Local)

Detail spec: [docs/milestones/m6.md](./milestones/m6.md)

- [ ] CLI workspace context auto-detection is implemented
- [ ] Status/logs/health/context observability commands are operational
- [ ] Local lifecycle and terminal command surfaces are complete
- [ ] `--json` output contracts are stable for machine consumption
- [ ] CLI flows are covered by command-surface tests

### M7 - Auth, Cloud, Preview, and PR

Detail spec: [docs/milestones/m7.md](./milestones/m7.md)

- [ ] Auth and organization-aware cloud data flow are implemented
- [ ] Repository linking and GitHub App integration are operational
- [ ] Fork-to-cloud and cloud-to-local flows are complete
- [ ] Preview routing/auth and share controls are production-viable
- [ ] PR creation path works from desktop and CLI surfaces
- [ ] RBAC and cloud flow tests pass

### M8 - Cloud Lifecycle Production-Ready

Detail spec: [docs/milestones/m8.md](./milestones/m8.md)

- [ ] Cloud sleep/wake lifecycle is implemented with restore semantics
- [ ] Cloud destroy guarantees cleanup and revocation
- [ ] TTL sweeper and org quota enforcement are active
- [ ] Cloud lifecycle reliability and policy tests pass

## Backlog

Backlog items are intentionally out of milestone sequencing and should not block active milestone work.

- Lifecycle-native agent workspace, native runtime/tool architecture, and attachment-first center panel: [agent-workspace.md](./backlog/agent-workspace.md)

## Cross-Milestone Standards (Always On)

- [ ] Canonical naming uses `workspace` across all layers
- [ ] Typed error model stays aligned with [docs/reference/errors.md](./reference/errors.md)
- [ ] State transitions stay aligned with [docs/reference/state-machines.md](./reference/state-machines.md)
- [ ] Provider boundaries stay aligned with [docs/reference/workspace-provider.md](./reference/workspace-provider.md)
- [ ] Reliability targets stay aligned with [docs/reference/slos.md](./reference/slos.md)

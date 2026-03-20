# Billing & Usage — Expansion Spec

> Deferred from wedge spec. Target: Phase 3+.

## Overview

Usage metering, spend tracking, and budget enforcement for organizations. The wedge ships without billing — workspaces run on a flat access model. Billing is layered on once the core workspace lifecycle is proven.

## Entities

### `usage` (raw meter event)

1. Purpose:
   - append-only record for billable usage and spend estimation
2. Required fields:
   - `event_id` (UUID)
   - `organization_id`
   - `workspace_id`
   - `event_type` (`workspace.active_started|workspace.active_stopped|workspace.create|workspace.wake|workspace.sleep|workspace.destroy|workspace.storage_sample`)
   - `quantity`
   - `unit` (`seconds|count|gb_hours`)
   - `occurred_at`
   - `idempotency_key`
   - `pricebook_version`
   - `created_at`
3. Invariants:
   - append-only; no in-place mutation after write
   - exactly-once effect at consumer boundary via `idempotency_key`
   - pricing is derived asynchronously from events

### `organization_usage` (rollup aggregate)

1. Purpose:
   - fast usage and spend view for product + billing
2. Required fields:
   - `organization_id`
   - `window`
   - `active_seconds`
   - `sleep_seconds`
   - `workspace_create_count`
   - `workspace_wake_count`
   - `storage_gb_hours`
   - `estimated_cost_usd`
   - `updated_at`
3. Invariants:
   - deterministic recomputation from `usage`
   - one canonical row per (`organization_id`, `window`)

## Key Indexes

- `usage`: unique (`idempotency_key`), index (`organization_id`, `workspace_id`, `occurred_at`, `event_type`)
- `organization_usage`: unique (`organization_id`, `window`)

## Control Plane Extensions

### Usage Metering Pipeline

- Emits billable usage events from workspace state transitions
- Performs idempotent aggregation into daily organization rollups

### Billing Policy Engine

- Computes billable usage and spend from rollups + pricing version
- Enforces organization budget policies (`notify|throttle|block-create`)

## API Endpoints

- `GET /v1/organizations/{organizationId}/usage`

## Provider Applicability

| Meter | `CloudWorkspaceRuntime` | `LocalWorkspaceRuntime` |
|-------|-------------------|-------------------|
| Workspace-hours (active) | Full metering | Not metered (runs on user hardware) |
| Workspace create | Metered | Event logged for analytics only |
| Workspace wake | Metered | Event logged for analytics only |
| Storage (sleeping) | Metered (R2) | Not metered (local disk) |
| Workspace count limits | Enforced per tier | Optional limit (org policy) |

Cloud workspaces are the primary billing surface. Local workspaces emit lifecycle events to Convex for analytics and audit but do not incur usage charges — compute runs on the user's own hardware. Organizations may optionally enforce workspace count limits for local workspaces via org policy.

## Billing Model

### Headline

Unlimited users at every tier. Pay for compute, not people.

### Tiers

|                          | Free      | Team      | Scale         | Enterprise        |
| ------------------------ | --------- | --------- | ------------- | ----------------- |
| Price                    | $0/mo     | $49/mo    | $199/mo       | Custom (annual)   |
| Included workspace-hours | 100       | 1,000     | 5,000         | Committed spend   |
| Concurrent workspaces    | 5         | Unlimited | Unlimited     | Unlimited         |
| Users                    | Unlimited | Unlimited | Unlimited     | Unlimited         |
| Support                  | Community | Email     | Priority      | Dedicated + SLA   |
| SSO/SCIM                 | —         | —         | —             | Included          |
| Audit logs               | —         | —         | —             | Included          |
| Custom domain            | —         | —         | $99/mo add-on | Included          |
| Budget controls          | —         | Basic     | Full          | Full + policy API |

### Overage rates (placeholder — calibrate to Cloudflare sandbox unit costs)

| Unit                    | Rate          |
| ----------------------- | ------------- |
| Workspace-hour (active) | $0.10/hr      |
| Workspace create        | $0.05/create  |
| Workspace wake          | $0.03/wake    |
| Storage (sleeping)      | $0.02/gb-hour |

Volume discounts apply automatically at Scale and Enterprise tiers.

### What counts as a workspace-hour

- Clock starts when workspace enters `ready`, `starting`, or `resetting` state.
- Clock stops when workspace enters `sleeping` or `destroyed` state.
- Granularity: per-second billing, displayed as hours.
- Sleeping workspaces do not consume workspace-hours (storage only).

### What is free at every tier

- Adding users and org members.
- Viewing workspace previews (share URLs).
- Agent sessions (compute is metered, identity is not).
- Workspace sleep/destroy actions.

### Enterprise tier

- SSO/SCIM included (not per-connection surcharge).
- Audit logs with SIEM export.
- Committed annual spend with negotiated rates.
- 99.99% uptime SLA.
- Budget policy API for programmatic spend controls.
- Guided onboarding and migration.

### Spend equation (daily estimate)

`estimated_cost_usd = (active_hours * active_hour_rate) + (wake_count * wake_rate) + (create_count * create_rate) + (storage_gb_hours * storage_rate)`

## Billing Guardrails

1. Auto-sleep default: 30 minutes idle (min 10, max 240 by policy).
2. Wake target: p95 <= 15 seconds.
3. Budget actions:
   - `notify`: alert only.
   - `throttle`: reduce new workspace create rate.
   - `block-create`: reject new creates until spend drops or budget is raised.

## Async Job Types

- `usage.rollup.daily`
- `budget.enforcement.scan`

## SLOs

- Usage event ingestion success: >= 99.99% daily
- p95 usage dashboard freshness: <= 5 minutes from event time
- Budget enforcement lag for `block-create`: <= 2 minutes from threshold crossing
- Default organization soft budget: Free=$20, Team=$100, Scale=$500, Enterprise=custom (self-serve override)
- Default organization hard budget: Free=$50, Team=$200, Scale=$1000, Enterprise=custom (admin override)

## Acceptance Criteria

1. Usage events are emitted transactionally with workspace state transitions.
2. Daily rollups are deterministic and replay-safe.
3. Budget enforcement blocks workspace creation within 2 minutes of threshold crossing.
4. Usage dashboard shows data within 5 minutes of event time.

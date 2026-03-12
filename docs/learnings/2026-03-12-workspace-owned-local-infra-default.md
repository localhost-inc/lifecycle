# Workspace-Owned Local Infra by Default

## Context

Kin surfaced a key authoring choice for local Lifecycle environments:

1. bind each workspace to a shared machine-level Postgres / Redis / Pub/Sub substrate and namespace resources inside it
2. give each workspace its own full local infra stack

The shared-substrate approach can be efficient, but it bakes machine-global mutable state into the default manifest story and makes portability worse for other repos and teams.

## Learning

The default local contract should prefer workspace-owned mutable infrastructure.

That keeps the manifest portable, keeps `start/stop/destroy` semantics honest, and aligns local and future cloud behavior around the same unit: one workspace owns one execution environment.

Shared local substrates are still valid, but they should be treated as explicit optimizations or future provider-level bindings, not as the default portable workflow.

## Change

1. Simplified Kin's Lifecycle manifest to use a workspace-owned Postgres / Redis / Pub/Sub stack.
2. Removed the Lifecycle-only `create-db` bootstrap task because the workspace-owned Postgres service now owns the database directly.
3. Preserved Kin's legacy namespaced resource behavior for preview environments and existing Kin CLI workflows outside Lifecycle.
4. Captured the default local posture in the `WorkspaceProvider` reference docs.

## Milestone Impact

1. M4 local environment authoring now has a clearer portable default for stateful sidecars.
2. M5 CLI and desktop lifecycle semantics stay aligned with a workspace-owned environment model.
3. M6 cloud parity gets simpler because local and cloud can both treat the workspace environment as the same unit of isolation.

## Follow-Up

1. Add explicit provider-level shared-resource bindings later only if a repo truly needs a shared local substrate.
2. Keep local caches shareable, but keep mutable runtime state workspace-owned by default.
3. Revisit named local routing separately from infra ownership so ingress does not force a shared-substrate model.

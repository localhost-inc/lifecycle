# Graph Manifest Boundary Shipped

## Context

The runtime had already converged on a graph-like executor, but the checked-in manifest contract still exposed a stopgap V1 shape with top-level `setup`, top-level `services`, and the `setup.services` bootstrap escape hatch.

That split caused two problems:

1. docs described multiple incompatible realities
2. task-like runtime work still lived under a misleading `services` name or behind compatibility lowering

## Learning

The simplest clean contract is:

1. `workspace` for workspace-scoped steps
2. `environment` for the flat dependency graph
3. explicit node `kind` to distinguish `task` from `service`

The extra nested `environment.services` layer was unnecessary because it still mislabeled task nodes as services. The graph key itself is the node identity.

## Change

1. Replaced the manifest boundary with `workspace` plus flat `environment`.
2. Removed `setup.services` from the executable contract.
3. Moved one-shot runtime work to `kind: "task"` nodes.
4. Reconciled `workspace_service` persistence against only `kind: "service"` nodes.
5. Updated the checked-in root `lifecycle.json` and reference docs to the same schema.

## Milestone Impact

1. M2 runtime state is now grounded in the graph-native manifest instead of a compatibility shape.
2. M4 local environment authoring is simpler for real multi-service repos like Kin.
3. M5 lifecycle controls can reason about real long-lived services without task rows leaking into service persistence.

## Follow-Up

1. Wire `workspace.teardown` into local stop/destroy execution.
2. Add end-to-end runtime coverage for a mixed task/service manifest.
3. Keep ingress and named local routing aligned with `environment` node identity rather than local port numbers.

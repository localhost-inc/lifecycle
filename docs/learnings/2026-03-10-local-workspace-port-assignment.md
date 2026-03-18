# Local Workspace Port Assignment

## Context

The local provider was still treating manifest ports as globally shared host ports.

That broke the core workspace model:

1. two local workspaces for the same repo could not run side by side without manual port edits
2. app restart could leave workspace rows claiming `active` even though in-memory supervisors were gone
3. setup scripts and services had no provider-provided way to discover sibling service addresses inside one workspace

## Learning

Local workspace isolation needs a first-class assigned host port layer.

1. `workspace_service.assigned_port` should be the authoritative host port the local provider actually binds for the current run.
2. `port_override` remains the explicit user choice, but non-overridden services should get a collision-free `assigned_port` at start time rather than treating the last boot's bind as durable config.
3. All services default to `local` exposure. Users can change exposure in the UI.
5. The local provider should inject reserved `LIFECYCLE_*` discovery env vars so setup and process services can discover sibling service host/port assignments without hardcoding global localhost ports.
6. App startup must reconcile stale workspace environment state back to an honest local baseline because supervisors are in-memory only.

## Milestone Impact

1. M4: makes workspace-level local service isolation real instead of manual-only.
2. M4: gives setup scripts a usable bridge for per-workspace service discovery.
3. M5: establishes the environment truth the CLI can later report through `workspace status` and `context`.

## Follow-Up Actions

1. Add explicit service-to-service URL templating or a local routing layer so app config does not need to assemble URLs manually from host/port pairs.
2. Stable local preview routing has now moved behind a Lifecycle-owned proxy; the remaining follow-up is to make per-boot host port reassignment safe behind that stable route.
3. Add durable runtime log capture and restart supervision so post-start failures are observable and actionable.

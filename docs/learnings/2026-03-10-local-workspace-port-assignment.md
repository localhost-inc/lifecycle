# Local Workspace Port Assignment

## Context

The local provider was still treating manifest ports as globally shared host ports.

That broke the core workspace model:

1. two local workspaces for the same repo could not run side by side without manual port edits
2. app restart could leave workspace rows claiming `active` even though in-memory supervisors were gone
3. setup scripts and services had no provider-provided way to discover sibling service addresses inside one workspace

## Learning

Local workspace isolation needs a first-class assigned host port layer.

1. `workspace_service.effective_port` should be the authoritative host port the local provider actually binds.
2. `default_port` stays the manifest preference, not a global guarantee.
3. `port_override` remains the explicit user choice, but the provider must still preserve a stable collision-free `effective_port` when no override is set.
4. `share_default` should seed `internal` vs `local` exposure honestly at service-row creation time.
5. The local provider should inject reserved `LIFECYCLE_*` discovery env vars so setup and process services can discover sibling service host/port assignments without hardcoding global localhost ports.
6. App startup must reconcile stale workspace environment state back to an honest local baseline because supervisors are in-memory only.

## Milestone Impact

1. M4: makes workspace-level local service isolation real instead of manual-only.
2. M4: gives setup scripts a usable bridge for per-workspace service discovery.
3. M5: establishes the environment truth the CLI can later report through `workspace status` and `context`.

## Follow-Up Actions

1. Add explicit service-to-service URL templating or a local routing layer so app config does not need to assemble URLs manually from host/port pairs.
2. Revisit a `portless`-style stable local routing surface if we want host port numbers to disappear from user-facing app config.
3. Add durable runtime log capture and restart supervision so post-start failures are observable and actionable.

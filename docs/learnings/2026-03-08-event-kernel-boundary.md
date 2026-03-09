# Event Kernel Boundary

Date: 2026-03-08
Milestone: Cross-milestone foundation with immediate M3 impact

## Context

The desktop app currently has several event-like layers:

1. Tauri app/window events emitted from backend capabilities
2. feature-local subscription wrappers in the desktop API layer
3. a store fan-in layer that reduces a subset of those signals into UI query updates

That is enough for current UI behavior, but it is not yet a first-class internal event kernel. If left implicit, those ad hoc transports become the accidental extension API for metrics, notifications, and future plugins.

## Observation

1. The current store fan-in is a consumer-side aggregation layer, not a canonical bus.
2. Lifecycle commands, lifecycle fact events, and hook/interception points are being treated too informally and risk collapsing into one another.
3. High-volume transports such as PTY output do not belong on the same channel as lifecycle facts.
4. Plugin/extensibility design gets much harder once multiple app layers have already invented their own incompatible event contracts.

## Decision

1. Define a single internal Lifecycle event kernel before attempting a plugin system.
2. Separate three concepts explicitly:
   - commands
   - fact events
   - command hooks
3. Keep provider/runtime code authoritative for lifecycle facts and normalize provider-specific signals before they reach the UI.
4. Keep PTY output, terminal input, and other stream-heavy transports outside the generic event kernel.
5. Treat the React store as one consumer of the kernel, not the kernel itself.

## Impact on milestones

1. M3: clarifies that terminal lifecycle events are normalized facts while PTY output remains dedicated stream transport.
2. M4: creates a clean place for lifecycle notifications, attention UX, and operation instrumentation.
3. M5: gives the CLI a shared observability/event vocabulary instead of a separate local-only reporting contract.
4. M6+: provides the right foundation for cloud activity feeds, audit, metrics, and future plugin subscriptions.

## Follow-up actions

1. Add a registry for canonical event names, versions, and payload schemas.
2. Route current workspace, service, and terminal lifecycle publishers through that registry.
3. Define a trusted command-hook boundary with `before|after|failed` phases.
4. Keep stream transports explicit instead of folding them into the generic kernel.

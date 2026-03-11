# Delete Legacy Paths When A New Graph Path Ships

Date: 2026-03-10

## Context

While moving workspace startup from a phased `setup` and `services` flow toward a lowered environment graph, it was easy to leave behind an older helper that only sorted service-only dependencies.

That kind of leftover is exactly how "temporary" compatibility turns into permanent architecture drift.

## Learning

When a new execution path becomes real, the old internal path should be removed in the same change unless it is still the user-facing compatibility boundary.

1. Compatibility belongs at the input boundary when required.
2. Duplicate internal executors, schedulers, or adapters should not survive once the replacement path is active.
3. Tests should move to the new canonical path instead of preserving dead helpers only to keep old unit tests alive.
4. Forward-only architecture applies to internal orchestration code, not just public APIs.

## Milestone Impact

1. M4: keeps workspace environment startup converging on one graph executor instead of a graph plus a phased legacy path.
2. M5: reduces observability and restart ambiguity because only one scheduler path can publish status and failure outcomes.

## Follow-Up

1. During future manifest and provider refactors, delete old helper paths as soon as the lowered executor becomes authoritative.
2. Treat internal compatibility leftovers as bugs, not cleanup debt.

# Supported Manifest Surface Only

## Context

The executable `lifecycle.json` contract had already been cleaned up to `workspace` plus `environment`, but it still carried top-level `reset` and `mcps` keys that were not part of the actual shipped local runtime story.

That mismatch created a bad authoring contract:

1. docs implied those features were ready
2. parsers tolerated those keys even though the product could not honor them
3. future-facing ideas leaked into the current manifest surface

## Learning

The manifest should only expose contracts that the runtime can actually execute today.

If a product capability is still aspirational, keep it in milestone and architecture docs, not in the checked-in manifest schema. Otherwise authors write against config that looks supported but is effectively dead weight.

## Change

1. Removed top-level `reset` and `mcps` from the executable manifest contract.
2. Added explicit parser validation so those keys fail fast instead of being silently ignored.
3. Updated the reference docs and milestone text to reflect that reset remains a product/runtime concept, not a manifest-configured feature.

## Milestone Impact

1. M2 and M4 now describe a cleaner separation between the environment runtime model and the manifest surface.
2. M4 local manifest authoring is more honest for repos being onboarded into Lifecycle.
3. M5 can add reset controls later without inheriting a premature manifest contract.

## Follow-Up

1. Reintroduce `reset` only when there is a concrete manifest-backed execution model.
2. Reintroduce MCP config only when Lifecycle actually provisions or supervises those servers.
3. Keep future manifest growth gated by runtime support, not just by design intent.

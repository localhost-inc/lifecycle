# Runtime Domains Reference Home

## Context

We needed a durable home for the runtime/control-plane domain taxonomy discussed while comparing Lifecycle's direction with cloud-first workspace platforms.

The repo already had strong contracts for providers, manifests, shell ownership, and milestone sequencing, but it did not have one canonical cross-milestone document for backend/runtime domain ownership.

## Observation

Without a stable taxonomy, new backend and CLI work tends to drift into vague nouns such as `manager`, `helpers`, or transport-specific feature modules.

That makes it harder to keep these concerns distinct:

1. provider authority
2. live execution machinery
3. transport mechanics
4. third-party integrations
5. multi-step user workflows

## Decision

1. Add [../reference/runtime-domains.md](../reference/runtime-domains.md) as the canonical runtime/control-plane taxonomy doc.
2. Keep milestone scope in `docs/milestones/*`, not in the taxonomy doc.
3. Keep active cutover work in `docs/execution/*`, not in the taxonomy doc.
4. Keep frontend organization feature-oriented; the new taxonomy is primarily for backend, provider, transport, and CLI architecture.

## Milestone Impact

- M4 gains a clearer home for local runtime domains such as process, terminal, preview, activity, and source materialization.
- M5 can hang CLI command surfaces off the same domain map instead of inventing CLI-only nouns.
- M6 gets a cleaner place for cloud transport, platform integrations, and workflow orchestration.

## Follow-up Actions

1. Link new backend/runtime documentation back to `runtime-domains.md` instead of re-explaining the taxonomy from scratch.
2. Prefer semantic runtime nouns such as `providers`, `execution`, `transport`, `integrations`, and `workflows` over generic `manager` buckets in future refactors.
3. Use execution docs if code is later reorganized around this taxonomy.

# Contributing

Lifecycle is public and source-available, but it is still a maintainer-led product codebase rather than a broad community project.

## Before You Start

1. Read [README.md](./README.md), [AGENTS.md](./AGENTS.md), [docs/plan.md](./docs/plan.md), [docs/reference/vision.md](./docs/reference/vision.md), and [docs/reference/vocabulary.md](./docs/reference/vocabulary.md).
2. Open an issue before writing a large patch, especially for product behavior, architecture, or milestone scope changes.
3. Keep proposed changes aligned with the active milestone contract.

## Local Setup

```bash
bun install
bun run qa
```

Optional:

```bash
git config core.hooksPath .githooks
```

## Change Expectations

1. Keep diffs small and contract-aligned.
2. Update docs when behavior, scope, or terminology changes.
3. Add or update tests for changed behavior when practical.
4. Use `workspace` as the canonical noun across code, docs, and APIs.
5. Prefer typed failures and explicit state transitions over implicit behavior.

## Verification

Run from repo root unless your change is docs-only:

1. `bun run format`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run test`
5. `bun run build`
6. `bun run qa`

`bun run qa` is the default verification bar for code changes.

## Pull Requests

1. One logical change per pull request.
2. Include a short problem statement, what changed, and what you verified.
3. Call out skipped checks, environment limits, or follow-up work explicitly.
4. Large unsolicited feature PRs may be closed if they do not align with the current roadmap.

## License and Submission Terms

By submitting a contribution, you agree that your contribution may be incorporated into this repository under the terms in [LICENSE](./LICENSE).

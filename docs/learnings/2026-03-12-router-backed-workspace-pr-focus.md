# Router-Backed Workspace PR Focus

## Learning

1. The workspace route can safely mirror the current Git rail tab and active pull request number without turning the whole surface into router-owned state.
2. URL state should carry only durable identifiers needed to restore focus after hot reload, while document snapshots, tab ordering, and runtime-tab visibility stay in desktop-owned local persistence.
3. Reopening a PR from the route should prefer provider detail by PR number, then fall back to current-branch or repository-list data when available.

## Why It Matters

1. Hot reload can now return users to the PR they were reviewing instead of dropping them back to the default Git rail state.
2. The existing workspace-surface ownership model stays intact: React Router restores focus, but it does not become the source of truth for document payloads or runtime lifecycle.

## Milestone Impact

1. M6 PR review flow is more resilient during desktop development without introducing a separate PR-specific navigation stack.

## Follow-Up Actions

1. If users need the same resilience for other document surfaces, extend the same identifier-only route pattern rather than serializing full document snapshots into the URL.
2. Keep route-backed workspace focus scoped to durable state; do not encode terminal/runtime authority into router params.

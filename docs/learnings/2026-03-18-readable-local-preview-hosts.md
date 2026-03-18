# 2026-03-18 - Readable local preview hosts

## Context

Local preview and runtime service URLs had already moved behind the Lifecycle
proxy, but the hostnames still encoded raw workspace and service identifiers.
That produced machine-friendly URLs like opaque hex blobs in the browser
location bar and made the local routing layer feel internal instead of product
grade.

## Learning

1. Stable local URLs should be named for humans first and machines second.
2. The right local contract is `<service>.<workspace>.lifecycle.localhost`,
   with the workspace portion derived from branch or worktree identity.
3. Hostnames still need deterministic disambiguation, so the workspace label
   keeps a short workspace suffix when needed for stability.
4. Ports remain runtime plumbing. The user-facing and service-facing HTTP
   contract should stay on provider-owned `.localhost` routes.

## Milestone impact

1. M4 local preview now exposes readable Lifecycle-owned proxy URLs instead of
   opaque encoded identifiers.
2. `LIFECYCLE_SERVICE_<NAME>_URL` remains stable while the bound service port is
   free to change between runs.

## Follow-up

1. Add the same readable hostname shape to any future HTTPS local preview mode.
2. Consider showing the workspace host label directly in desktop UI copy where
   users manage previews or service URLs.

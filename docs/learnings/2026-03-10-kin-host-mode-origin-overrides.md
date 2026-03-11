# Kin Host-Mode Origin Overrides

Date: 2026-03-10

## Context

While grounding the environment graph against the real `~/dev/kin` repo, the remaining blocker was not the graph executor itself. It was host-mode addressability.

Kin's web and admin apps assumed the API always lived at `http://localhost:3001`. That breaks as soon as Lifecycle runs multiple local workspaces and assigns stable per-workspace host ports.

## Learning

1. Local host-mode environments need a first-class path for apps to consume Lifecycle-assigned service ports.
2. Reserved runtime env vars like `LIFECYCLE_SERVICE_API_PORT` are enough for setup and process launch, but app code still needs an explicit override input.
3. Default-only config (`localhost:3001` fallback with no override) is not compatible with workspace-level isolation.
4. Setup is the right place to materialize non-secret `.env.local` files from Lifecycle-assigned ports when an app already expects that pattern.

## Kin Proof

1. Kin now has a real `lifecycle.json` that:
   - builds the custom Postgres image
   - mounts persistent workspace volumes
   - writes per-workspace `.env.local` files from `LIFECYCLE_SERVICE_*` env vars
   - creates the namespaced database
   - runs migrations
   - provisions Pub/Sub resources
   - starts `api`, `worker`, `admin`, and `web`
2. Kin web/admin config now accepts an explicit API origin override instead of assuming the default local API port forever.

## Milestone Impact

1. M5/M6 local environment work must treat runtime-assigned service addresses as a real contract, not an implementation detail.
2. Kin is now closer to being the proving repo for "Lifecycle can run real workspaces in isolation on host mode."

## Follow-Up

1. Add interpolation or structured runtime env composition later so manifests do not need shell-heavy commands for dynamic addresses.
2. Start an actual Kin workspace through Lifecycle and capture the first end-to-end failures instead of stopping at manifest validation.

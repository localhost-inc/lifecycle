# Explicit Image Volume Mount Types

## What changed

We removed the `workspace://` volume-source convention from `lifecycle.json`.

Image-service mounts now use explicit Compose-like entries:

- `type: "bind"` for workspace-relative bind mounts
- `type: "volume"` for provider-managed named workspace volumes

## Why

`workspace://...` was a hidden protocol baked into the runtime. It made manifests harder to read, pushed storage behavior into string parsing, and diverged from the more explicit mount model developers already know from Docker Compose.

Explicit mount types keep the current local provider behavior while making the manifest contract easier to understand and extend.

## Milestone impact

- M5: Improves local workspace-environment authoring clarity for image services.
- M7: Keeps volume semantics explicit as cloud durability rules evolve.

## Follow-up

1. If `environment` grows non-node resources, move image-service storage toward `environment.volumes` plus mount references.
2. Keep named-volume durability/provider guarantees explicit instead of inferring persistence from mount syntax.

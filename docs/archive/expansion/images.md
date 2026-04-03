# Organization Images — Expansion Spec

> Deferred from wedge spec. Target: Phase 4.

## Overview

Allow organizations to register reusable OCI images and select one as the default sandbox base image.
Default selection lives on organization settings via flat field `default_sandbox_image_id`.

## Entity

### `organization_image` (organization-managed image)

1. Purpose:
   - allow organizations to register reusable OCI images and select one as default sandbox base image
2. Required fields:
   - `image_id` (UUID)
   - `organization_id`
   - `name` (human-friendly alias, unique per organization)
   - `image_ref` (registry/repository:tag)
   - `image_digest` (resolved immutable digest)
   - `kind` (`sandbox-base|service-base|toolchain`)
   - `status` (`draft|validating|ready|failed|deprecated`)
   - `created_by`
   - `created_at`, `updated_at`
3. Invariants:
   - `image_digest` is immutable after `status=ready`
   - workspace create uses image resolution precedence: workspace override -> organization default -> lifecycle platform default image
   - only `status=ready` and non-`deprecated` images can be assigned to `organization.default_sandbox_image_id`

## Key Indexes

- `organization_image`: unique (`organization_id`, `name`)

## Validation Pipeline

1. On add/update, control plane runs `organization.image.validate` job.
2. Validation checks minimum runtime contract (shell, git, certs, archive tooling, non-root execution support).
3. Optional org policy checks: vulnerability threshold, required packages, license policy.
4. Cloudflare-first execution:
   - image metadata and validation are provider-agnostic in control plane
   - Cloudflare runtime adapter is the default consumer of resolved `image_id`

## Image Selection and Precedence

1. Workspace create may optionally request `image_id`.
2. If omitted, lifecycle resolves `organization.default_sandbox_image_id`.
3. If no organization default exists, lifecycle platform default image is used.

## Failure Behavior

- If selected image is `failed|deprecated`, workspace creation is rejected with actionable error.
- If image pull fails at create time, workspace transitions to `failed` with typed `failure_reason=image_pull_failed`.

## API Endpoints

- `GET /v1/organizations/{organizationId}/images`
- `POST /v1/organizations/{organizationId}/images`
- `GET /v1/organizations/{organizationId}/images/{imageId}`
- `PATCH /v1/organizations/{organizationId}/images/{imageId}`
- `POST /v1/organizations/{organizationId}/images/{imageId}/validations`
- `PATCH /v1/organizations/{organizationId}` (`default_sandbox_image_id` as flat field)

Default selection payload:

```json
{
  "default_sandbox_image_id": "img_123"
}
```

## CLI Commands

- `lifecycle org image list`
- `lifecycle org image add --name <name> --image <registry/repository:tag>`
- `lifecycle org image validate --image <image-id>`
- `lifecycle org image set-default --image <image-id>`
- `lifecycle org image deprecate --image <image-id>`

## Async Job Types

- `organization.image.validate`

## SLOs

- p95 organization image validation job completion: <= 5 minutes

## Acceptance Criteria

1. Organization admins can register/validate/set-default images.
2. New workspaces honor resolved image digest.
3. Custom image changes never mutate existing running workspaces in place.

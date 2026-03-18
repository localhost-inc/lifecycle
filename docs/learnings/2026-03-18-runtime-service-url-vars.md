# Runtime Service URL Vars

## Context

The desktop local runtime already had two distinct networking layers:

1. direct per-run bind details in `assigned_port`
2. stable Lifecycle-owned HTTP routing under `*.lifecycle.localhost`

We only exposed the stable route through `workspace_service.preview_url`, while
reserved runtime discovery env vars still pushed service-to-service wiring back
onto `HOST`/`PORT`/`ADDRESS`.

## Learning

1. User-facing preview routing and service-to-service HTTP routing should use the same stable provider-owned URL surface.
2. `LIFECYCLE_SERVICE_<NODE_NAME>_URL` is the right primary runtime env var for HTTP clients.
3. `HOST`/`PORT`/`ADDRESS` still matter for direct socket clients and non-HTTP protocols.
4. Proxy routing readiness should follow service runtime state, not `preview_status`, because internal services also need stable HTTP discovery without becoming user-facing previews.

## Milestone Impact

1. M4 local runtime now exposes stable HTTP service URLs without coupling app config to ephemeral bind ports.
2. Preview UX remains exposure-driven through `preview_url`, while runtime service routing is provider-owned infrastructure.

## Follow-Up

1. Audit desktop docs and examples to prefer `LIFECYCLE_SERVICE_*_URL` for HTTP clients.
2. Reduce UI emphasis on direct ports now that the stable route is the primary interface users care about.

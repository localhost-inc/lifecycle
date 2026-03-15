# Loopback Preview Host Consistency

## Context

Lifecycle reserved local service ports against `127.0.0.1`, and runtime service discovery already exposed `LIFECYCLE_SERVICE_*_HOST=127.0.0.1`.

The preview surface did not use the same contract:

1. stored `preview_url` values used `http://localhost:<effective_port>`
2. the desktop UI opened local previews on `localhost`
3. browsers could resolve `localhost` to a different loopback listener than the one Lifecycle validated

That made a workspace preview appear healthy in Lifecycle while an `Open` action landed in another local app.

## Learning

Local preview URLs must use the same loopback host Lifecycle actually reserves and injects into runtime env.

1. `preview_url` for local services should be `http://127.0.0.1:<effective_port>`.
2. UI preview helpers should derive local preview URLs from `effective_port` on the same host.
3. Local port viability checks should treat an occupied loopback port as unavailable across both IPv4 and IPv6 loopback listeners.
4. Local port discovery and browser-open behavior need one consistent address contract; `localhost` is too ambiguous for that role.

## Milestone Impact

1. M4: makes local preview opening match the provider-managed port assignment contract.
2. M4: removes a class of false-positive "ready" previews caused by loopback host alias drift.

## Follow-Up Actions

1. Audit remaining local networking surfaces for `localhost` aliases that should instead use the explicit managed loopback host.
2. If we later support dual-stack loopback previews intentionally, model that as an explicit provider capability rather than an implicit alias.

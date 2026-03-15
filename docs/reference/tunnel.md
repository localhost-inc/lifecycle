# Tunnel and Preview Transport

This document captures the recommended direction for tunnel-backed previews and sharing.

## Problem

The current preview model risks coupling two different concerns:

1. **transport**
   - how traffic reaches a workspace service
   - direct `localhost` vs tunnel-backed URL
2. **access policy**
   - who can use that URL
   - local-only, share link, team, or organization-gated access

If the first tunnel implementation is forced through `organization` semantics, local mode inherits auth, RBAC, and enterprise policy requirements before it gets a simple shareable URL.

## Recommended Split

Tunnels should be designed as a transport layer first, with access policy layered on top.

1. **Transport**
   - `local`: direct `http://127.0.0.1:<effective_port>`
   - `shared`: optional tunnel-backed URL for a local or cloud workspace
2. **Access policy**
   - local-only
   - authenticated share link
   - team/organization membership
   - public, if ever supported

The current `workspace_service.preview_status`, `preview_url`, and `preview_failure_reason` fields are the right provider-agnostic contract to keep.

## Local-Mode Direction

The first tunnel-backed sharing feature should support local workspaces without requiring the full organization/auth route.

1. Local workspaces should continue to work with no network and no auth.
2. Enabling a tunnel should be optional and additive.
3. The first user-facing concept should be **shared** rather than **organization**.
4. If the current `workspace_service.exposure` field remains overloaded, do not force v1 tunnels through `organization`; introduce a separate `shared` concept before shipping tunnel UI.

## Lifecycle Integration

Tunnel lifecycle should be driven by workspace/environment lifecycle, not buried inside service startup.

1. `run` and `wake`
   - reconcile desired tunnel state
   - restore or rebind the preview URL if the provider supports it
2. `sleep`
   - suspend or unpublish tunnel access
3. `destroy`
   - revoke the tunnel and clean provider state
4. service restart / hot reload
   - preserve stable URL when possible
   - keep `preview_status=provisioning` during rebind

## Provider Boundary

Tunnel management should live behind a dedicated adapter boundary, separate from process/container supervision.

Responsibilities:

1. provision a share URL
2. health-gate publication
3. suspend, resume, reconcile, and revoke previews
4. preserve provider-specific state needed for stable URLs
5. support HTTP/HTTPS plus WebSocket and SSE traffic correctly

Out of scope for preview URLs:

1. raw TCP
2. raw UDP

## Local v1 Recommendation

The best first step is a single user-configured tunnel provider for local sharing.

1. optimize for simple local workspace sharing
2. keep enterprise/team policy as a later overlay
3. prefer a provider that can support authenticated sharing without requiring Lifecycle to build org policy first

Candidate directions:

1. authenticated tunnel providers such as Tailscale Serve/Funnel
2. simpler quick-tunnel providers for prototype/demo flows

## Milestone Placement

1. **M4**
   - local preview remains `localhost`
   - service controls and preview metadata stay local-first
2. **Post-M4 / local sharing slice**
   - add optional tunnel-backed `shared` transport for local workspaces
3. **M6**
   - organization-aware preview auth, policy, and cloud routing can layer on top of the same preview contract

## Guardrails

1. Do not make tunnels a prerequisite for local preview.
2. Do not make organization/auth semantics a prerequisite for first local sharing.
3. Keep tunnel state additive to the existing `workspace_service` preview contract.
4. Keep the adapter boundary explicit so tunnel logic does not sprawl into `start_services`.

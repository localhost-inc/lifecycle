# Cloud Terminal Worldview Must Extend The Native Desktop Host

Date: 2026-03-12
Milestone: M6

## Context

Lifecycle's M3 work established a native libghostty host as the desktop terminal model on macOS, but the future cloud-terminal docs still described shared sessions as browser terminal clients talking to a sandbox PTY over WebSockets.

That left the cloud roadmap pulling against the local architecture:

1. the workspace surface already treats terminal tabs as provider-backed runtime tabs with native-host synchronization concerns
2. local terminal docs explicitly removed the browser-renderer worldview from the main desktop product
3. shared-session semantics already depend on authoritative PTY output, not on mirroring UI-local keystrokes between collaborators

## Learning

Cloud terminals should change provider transport, not desktop presentation.

1. The authoritative runtime still differs by mode:
   - local: native libghostty-owned session on the host machine
   - cloud: sandbox-owned PTY session, optionally fronted by a Durable Object multiplexer
2. The desktop app should keep one terminal surface model where possible. If the platform has a native terminal host, cloud terminal tabs should attach through that same host lane instead of reintroducing a browser terminal renderer in the main app.
3. For native Ghostty specifically, remote collaboration is better modeled as a local attach/proxy command inside the native surface than as an app-owned "feed remote PTY bytes directly into this NSView" API.
4. Shared-session correctness still comes from the remote PTY stream: collaborator output is fanned out from the authoritative PTY, and stdin permission is enforced at the provider transport layer.

## Impact

- M6 docs now describe cloud shared terminals as a provider-owned attach transport under the existing desktop terminal host model.
- Provider and Convex API docs no longer imply that cloud mode requires a separate browser-terminal worldview in the desktop app.
- Invite and presence flows stay the same, but attach semantics are now aligned with the native-first desktop architecture.

## Follow-Up

1. When M6 implementation starts, define the concrete attach/proxy helper contract explicitly enough to cover launch, reconnect, and failure handling.
2. Keep browser join pages focused on auth, invite redemption, and deep-link bootstrap unless a real web terminal milestone is scheduled.
3. If another native terminal host is added on Linux or Windows, keep the same rule: provider transport may vary, but the runtime-tab and desktop surface model should not fork by workspace mode.

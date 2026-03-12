# Cloud Terminal Attach Transport

This document defines the desktop-side attach contract for cloud terminals on platforms that have a native terminal host.

## Purpose

Cloud terminal runtime and desktop terminal presentation are separate concerns:

1. the authoritative terminal session runs in the cloud provider runtime
2. the desktop app owns tab selection, surface visibility, and native-host synchronization
3. a local attach helper bridges the native terminal host to the authoritative remote PTY transport

The goal is to keep one terminal presentation model in the desktop app while allowing provider-specific remote attach behavior underneath it.

## Authority Boundary

Treat these layers separately:

1. **Remote terminal session**
   - authoritative PTY process in the Cloudflare Sandbox
   - optional Durable Object multiplexer for shared sessions
2. **Terminal domain record**
   - provider-owned metadata and lifecycle (`active|detached|sleeping|finished|failed`)
   - source of canonical `terminal.*` facts
3. **Desktop attach helper**
   - ephemeral local process launched inside the native terminal host
   - bridges local stdin/stdout to the remote transport
   - not the source of terminal lifecycle truth
4. **Desktop surface state**
   - local UI state such as selected tab, visible/hidden host surface, and reconnect UI
   - not persisted as provider-authoritative terminal status

## Contract Summary

1. Cloud terminal tabs remain the same runtime-tab class as local terminals.
2. On native-hosted desktop platforms, a cloud terminal tab launches a local attach helper inside the native terminal surface.
3. The attach helper connects to either:
   - the sandbox terminal endpoint for solo sessions
   - the Durable Object multiplexer for shared sessions
4. The attach helper is an attachment process, not the terminal session itself.
5. Killing or relaunching the helper must not by itself mark the remote terminal `finished` or `failed`.

## Launch Contract

### Desktop Flow

1. User opens or restores a cloud terminal tab.
2. Desktop app fetches terminal metadata from the authoritative provider/control plane.
3. Desktop app calls `terminals.mintAttachToken(terminalId)`.
4. Desktop app launches the native surface with the stable helper command.
5. Helper redeems the attach token and begins bridging stdin/stdout.

### Helper Command Surface

Use one stable helper entrypoint:

```text
lifecycle terminal attach
```

The helper should not require provider-specific subcommands in the native host launch path. Provider-specific routing details come from the attach payload.

### Helper Input

Pass ephemeral attach data through environment variables, not argv, so short-lived secrets do not leak through process listings or shell history.

Required helper inputs:

```ts
interface CloudTerminalAttachRequest {
  workspaceId: string;
  terminalId: string;
  role: "viewer" | "editor";
  targetKind: "sandbox" | "shared_session";
  wssUrl: string;
  attachToken: string;
  expiresAt: string; // ISO-8601 timestamp
}
```

Recommended environment variables:

```text
LIFECYCLE_WORKSPACE_ID
LIFECYCLE_TERMINAL_ID
LIFECYCLE_ATTACH_ROLE
LIFECYCLE_ATTACH_TARGET_KIND
LIFECYCLE_ATTACH_URL
LIFECYCLE_ATTACH_TOKEN
LIFECYCLE_ATTACH_EXPIRES_AT
```

Rules:

1. `attachToken` is secret and must never be logged in plaintext.
2. `wssUrl` is provider-issued and opaque to the desktop shell.
3. Helper launch cwd is not a source of workspace authority for cloud mode.
4. Theme, font, visibility, and geometry stay outside the helper payload; those belong to the native terminal host and desktop sync contract.

## I/O and Sharing Rules

1. PTY output is the authoritative shared state and is fanned out from the provider transport.
2. Input authority is enforced remotely:
   - `editor` connections may forward stdin
   - `viewer` connections may not mutate stdin
3. The desktop app must not mirror one collaborator's abstract key events into another collaborator's renderer.
4. The helper bridges byte/text transport only; it does not invent higher-level lifecycle state.

## Detach and Kill Semantics

1. `detachTerminal(terminalId)`:
   - hides or tears down the local attach helper
   - leaves the remote PTY session running
   - keeps terminal domain status in a live state such as `detached`
2. `killTerminal(terminalId)`:
   - is a provider-authoritative mutation against the remote terminal session
   - should terminate the remote PTY
   - causes the helper to exit because the remote session ended
3. Closing a tab or switching away from it should detach the helper, not kill the remote PTY.

## Reconnect Contract

Reconnect is a desktop attach concern, not a terminal-runtime identity change.

1. If a visible cloud terminal loses its helper attachment, the desktop app may remint an attach token and relaunch the helper.
2. Reconnect should target the same `terminalId`; no new terminal record is created.
3. Helper restarts must preserve provider-owned terminal identity and label.
4. Shared-session presence should be restored when the new helper reconnects through the Durable Object.

## Failure Handling

### What Is Not A Terminal Lifecycle Failure

These should surface as desktop attach errors or reconnect states, not as terminal `finished|failed`:

1. helper launch failure on the local machine
2. expired or already-redeemed attach token before the remote PTY is reached
3. transient transport disconnect while the remote PTY is still alive
4. viewer stdin rejection by the shared-session transport

### What Is A Terminal Lifecycle Failure

These are provider-authoritative terminal outcomes:

1. remote PTY exits normally -> `finished`
2. remote PTY exits with failure -> `failed`
3. workspace destroy or sleep intentionally tears down remote terminal availability

### Current Public Error Shape

V1 keeps `terminal.failure_reason` narrow. Desktop attach-helper failures should usually surface through typed mutation/query error details or local UI state without rewriting the canonical terminal failure enum unless the provider also marks the terminal session failed.

## Observability

Log at the helper boundary with redaction:

1. helper launch started / launch failed
2. token redemption accepted / rejected
3. remote transport connected / disconnected
4. shared-session role observed (`viewer|editor`)
5. reconnect attempt count and terminal id

Do not log:

1. raw attach tokens
2. terminal input payloads
3. full PTY output streams

## Non-Goals

1. Browser-terminal fallback in the main desktop product path
2. A second desktop tab model for cloud terminals
3. Using the helper process as the source of terminal lifecycle truth
4. Passing provider secrets or attach tokens via argv

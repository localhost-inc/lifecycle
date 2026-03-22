# Milestone 5: "I can inspect and control local workspaces from the CLI"

> Prerequisites: M4
> Introduces: CLI workspace context auto-detection, observability commands, `lifecycle context`, local lifecycle CLI commands
> Tracker: high-level status/checklist lives in [`docs/plan.md`](../plan.md). This document is the detailed implementation contract.

## Goal

A developer (or agent) working inside a workspace worktree can use the Lifecycle CLI to inspect status, tail logs, run health checks, create workspaces, control their environments, and get a structured context dump -- without passing IDs. When the CLI is invoked from a Lifecycle-launched session, it can also drive existing workspace surfaces like tabs and browser previews through a local bridge. No cloud, no auth, no network.

## What You Build

1. **Workspace context auto-detection**: CLI detects active workspace from cwd (you're inside a worktree -> CLI knows which workspace, project, and services without `--workspace <id>`). Explicit `--workspace` flag overrides auto-detection. All workspace-scoped commands benefit from this -- no ID juggling.
2. **Output conventions**: every read command supports `--json` for structured, parseable output (agent-friendly). Default output is pretty-printed for humans -- compact, scannable, no noise. `--json` output contracts are stable and documented.
3. **Observability commands** (the agent surface):
   - `lifecycle workspace status` -- workspace metadata, environment status, git ref/sha, mode, all services with ports and health, uptime. Default output is a single-screen dashboard. `--json` emits full structured state.
   - `lifecycle workspace logs <service>` -- tail service stdout/stderr. Flags: `--tail <n>`, `--since <duration>`, `--grep <pattern>`, `--follow`. `--json` emits newline-delimited JSON log entries.
   - `lifecycle workspace health` -- run all service health checks on demand and report results. Shows check type, target, pass/fail, latency. `--json` for structured results.
   - these are the aggregate workspace-oriented reads; narrower per-service verbs live under `lifecycle service ...`
4. **Context command** (designed for agents):
   - `lifecycle context` -- single command that dumps everything an agent needs to orient: workspace metadata, environment status, git info, all services with ports/health/preview URLs, available CLI commands. Structured, dense, one-shot. Always `--json`-shaped output even without the flag (this command exists for machines).
5. **Service commands**:
   - `lifecycle service list` -- table of services with runtime, status, assigned port, and preview URL. `--json` for structured output.
   - `lifecycle service info <service>` -- narrow agent-friendly status for one service in the current workspace.
6. **Local lifecycle commands**:
   - `lifecycle workspace create --project <id> --ref <branch> --local`
   - `lifecycle workspace run`
   - `lifecycle workspace reset`
   - `lifecycle workspace destroy`
   - `lifecycle terminal start [--harness claude|codex|...]`
   - `lifecycle terminal status [terminal-id]`
7. **Desktop shell commands** (agent-visible app control):
   - `lifecycle tab open --surface browser --url <url>` -- open or focus a browser surface in the current workspace
   - `lifecycle tab open --surface terminal [--harness claude|codex|shell]` -- open or focus a terminal surface in the current workspace
   - `lifecycle browser snapshot` -- capture the current browser surface for agent inspection
   - shell commands are only available when the CLI can reach the running desktop app
8. **Onboarding commands** (local-only):
   - `lifecycle prepare`
   - `lifecycle repo init`
   - `lifecycle repo list`
9. **Help and discoverability**: every subcommand has `--help` with examples. `lifecycle` with no args prints a concise command map. Error messages suggest the right command when possible.

## Implementation Contracts

### Boundary Model

The CLI is one surface over three distinct authority boundaries:

1. `backend` -- project and workspace catalog, workspace identity, workspace create/rename/destroy, manifest reads, branch lookup, and workspace lookup by id or cwd
2. `workspace` -- service, terminal, file, git, log, and health operations scoped to an existing workspace
3. `desktop shell` -- tabs, panes, browser surfaces, focus, selection, and visual capture inside the running desktop app

Ownership and hosting are intentionally separate:

1. In local mode, the running desktop app hosts all three boundaries today.
2. That does **not** collapse them into one API blob. Commands still route to one authoritative owner.
3. Future cloud work may move `backend` and `workspace` off-device while keeping `desktop shell` local.

### User-Facing Command Taxonomy

User-facing command families should optimize for the acted-on thing, not mirror implementation package names exactly.

1. `project` -- backend-owned project catalog and setup commands
2. `workspace` -- backend-owned workspace lifecycle and high-level context commands
3. `service` -- workspace-owned runtime service commands for the current workspace
4. `terminal` -- workspace-owned interactive runtime commands for the current workspace
5. `tab` -- desktop-shell-owned surface placement and focus commands
6. `browser` -- desktop-shell-owned browser surface commands like snapshot and reload
7. `context` -- aggregate agent-facing read that composes backend, workspace, and desktop-shell facts when available

This gives the CLI a simple user mental model:

1. If the command acts on a durable workspace record, it belongs under `workspace`.
2. If the command acts inside a workspace runtime, it belongs under `service` or `terminal`.
3. If the command changes what the user sees in the app, it belongs under `tab` or `browser`.

Examples:

1. `lifecycle workspace create` -> backend
2. `lifecycle workspace destroy` -> backend
3. `lifecycle service start api` -> workspace
4. `lifecycle service info api --json` -> workspace
5. `lifecycle terminal start --harness codex` -> workspace
6. `lifecycle tab open --surface browser --url http://localhost:3000` -> desktop shell
7. `lifecycle browser snapshot --json` -> desktop shell
8. `lifecycle tab open --surface terminal --harness codex` -> hybrid: workspace creates or resolves the terminal session, desktop shell places or focuses it

### Local Hosting Model

For local mode in M5, the CLI talks to the running desktop app for authoritative operations.

1. There is no standalone local daemon in M5.
2. Local `backend` and `workspace` operations are hosted by the desktop app process.
3. `tab` and `browser` commands require the desktop app because they target app-local UI state.
4. When the desktop app is unavailable, local commands fail with a typed `local_app_not_running` error instead of silently degrading.

### Integration Architecture

The CLI is the primary local control surface. MCP may wrap it later, but M5 should treat the CLI as the canonical command contract and avoid building a second parallel local-control API first.

#### Current Shipped Slice

The currently wired bridge path is intentionally narrow:

1. `lifecycle service info`
2. `lifecycle service list`
3. `lifecycle service start`
4. `lifecycle context`
5. `lifecycle tab open --surface browser --url ...`

Everything else in this document remains the target shape for M5, not shipped behavior yet.

#### Request Routing

Every CLI command resolves to one of three handler paths:

1. `backend` handler -- durable project/workspace catalog and lifecycle verbs
2. `workspace` handler -- service, terminal, file, git, and runtime inspection verbs
3. `desktop shell` handler -- pane, tab, browser, focus, and snapshot verbs

Routing rule:

1. `workspace create|destroy|status|context` may compose backend and workspace reads
2. `service *` and `terminal *` route to workspace handlers
3. `tab *` and `browser *` route to desktop-shell handlers
4. Hybrid commands may call both, but must preserve the authority boundary of each underlying step

#### Local Desktop Bridge

The desktop app exposes one local request/response bridge for CLI access.

1. Transport: local-only socket or named pipe, not HTTP
2. Serialization: versioned JSON request/response envelope
3. Scope: one bridge per running desktop app instance
4. Discovery:
   - Lifecycle-launched sessions use `LIFECYCLE_BRIDGE`
   - external-shell descriptor discovery is still deferred

The bridge exists to let the CLI talk to the running app process. It is not a second user-facing API surface.

#### Bridge Envelope

Requests and responses should be boring, explicit, and correlation-friendly.

Request:

```json
{
  "id": "req_123",
  "version": 1,
  "method": "tab.open",
  "params": {
    "workspaceId": "ws_123",
    "surface": "browser",
    "url": "http://localhost:3000",
    "select": true,
    "split": false
  },
  "session": {
    "terminalId": "term_123",
    "token": "..."
  }
}
```

Response:

```json
{
  "id": "req_123",
  "ok": true,
  "result": {
    "workspaceId": "ws_123",
    "tabKey": "browser:preview:web",
    "paneId": "pane-root"
  }
}
```

Error:

```json
{
  "id": "req_123",
  "ok": false,
  "error": {
    "code": "browser_surface_not_found",
    "message": "No browser surface is available for workspace ws_123.",
    "suggestedAction": "Open a browser surface first with `lifecycle tab open --surface browser --url ...`.",
    "retryable": false
  }
}
```

#### Desktop App Handler Split

Inside the desktop app, the bridge splits again by ownership.

1. Rust/Tauri handles `backend` and `workspace` requests directly using the same underlying capabilities the app already uses for Tauri invokes.
2. Rust/Tauri also terminates the socket bridge and enforces session/token validation.
3. Frontend React code handles `desktop shell` requests because pane/tab/browser state is frontend-owned today.
4. Rust forwards frontend-owned requests into the webview through a typed request/response channel instead of trying to reimplement shell state in Rust.

This keeps local runtime control close to existing Tauri capability code while respecting that the workspace canvas, browser tab keys, and pane focus are currently React-owned.

#### Frontend Shell Request Handling

Frontend shell requests should use the existing workspace open/focus primitives instead of bespoke one-off handlers.

1. `tab.open --surface browser` resolves a stable browser key and calls the workspace document open path.
2. Other `tab.open` surfaces still use the old stub path.
3. `browser.reload` and `browser.snapshot` are still deferred.

#### Idempotency and Stable Keys

Shell commands must be idempotent where the UI model already supports it.

1. Browser tabs use stable `browserKey` values.
2. Opening the same browser key again should focus the existing tab instead of creating duplicates.
3. File, changes-diff, commit-diff, and pull-request tabs follow the same singleton-or-focus rule where current canvas state already models singleton identity.
4. `tab open --split` is the explicit escape hatch when the caller wants a new pane placement instead of a focus.

Recommended browser key rules:

1. explicit `--key` wins when provided
2. preview/service-driven opens use deterministic keys like `preview:<service>`
3. raw URL opens default to a normalized URL-derived key

#### Browser Snapshot Contract

`lifecycle browser snapshot` is an app-owned visual capture command, not a browser automation framework.

This command is not shipped yet.

Rules:

1. It captures the actual browser surface the user sees in the desktop app.
2. It does not implicitly start services or open missing tabs.
3. The normal agent flow is `service info/start` -> `tab open` -> `browser snapshot`.
4. It should support structured output with image metadata and either base64 image data or a stable temp-file path.
5. It should fail with a typed error when there is no target browser surface.

Suggested JSON result shape:

```json
{
  "workspaceId": "ws_123",
  "tabKey": "browser:preview:web",
  "url": "http://localhost:3000",
  "capturedAt": "2026-03-21T18:10:00.000Z",
  "image": {
    "mediaType": "image/png",
    "width": 1440,
    "height": 900,
    "base64": "..."
  }
}
```

#### Workspace Visibility Rules

The bridge must be allowed to ensure that the target workspace is actually visible before placing surfaces.

1. If the target workspace tab is already open in a window, focus that window/tab.
2. If the workspace exists but is not currently open, open the workspace tab first.
3. Surface placement then happens inside that workspace tab.
4. Window selection should be deterministic: prefer an existing window containing the workspace; otherwise use the active app window.

#### Session-Initiated Commands

When a harness session runs inside the app, the CLI should feel local and zero-config.

1. `service` and `terminal` commands use session env plus cwd to resolve the current workspace.
2. `tab` and `browser` commands additionally use the injected bridge path and session token.
3. The session token scopes what the harness is allowed to control in the shell bridge.
4. Session-initiated shell commands should default to the current workspace tab, not global app navigation.

#### Recommended Implementation Layout

Keep the implementation split by concern instead of burying everything in the CLI package.

1. `packages/cli` -- command parsing, help, output formatting, command-family routing
2. `apps/desktop/src-tauri/src/capabilities/...` -- bridge listener plus backend/workspace request handlers
3. `apps/desktop/src/features/workspaces/...` -- frontend shell request handlers for tab open, focus, browser reload, and browser snapshot
4. shared request/response schemas should live with other typed contracts, not as ad hoc JSON in the CLI

#### Non-Goals

1. No separate local daemon in M5
2. No browser-automation-only testing path for local app surfaces
3. No duplicate “CLI API” beside the bridge envelope
4. No requirement that MCP bypass the CLI; wrapping the CLI is acceptable as long as the CLI contract stays canonical

### Full Command Surface (Local)

#### Global Conventions

1. **Workspace context auto-detection**: when cwd is inside a workspace worktree, all workspace-scoped commands auto-resolve the workspace. Explicit `--workspace <id>` overrides.
2. **`--json` flag**: every read command supports `--json` for stable, structured output. Default output is human-readable.
3. **Quiet defaults**: no banners, no tips, no emoji. `--verbose` for debug output.
4. **Error style**: errors include the failed command, reason, and suggested next step.
5. **Resolution order**: explicit flags win, then session-injected Lifecycle env vars, then cwd-based auto-detection.

#### Onboarding (Local)

1. `lifecycle prepare`
2. `lifecycle repo init`
3. `lifecycle repo list`

#### Workspace and Environment Lifecycle (Local)

1. `lifecycle workspace create --project <id> --ref <branch> [--local]`
   - default: `--local` from CLI (cloud mode deferred to M6)
2. `lifecycle workspace run`
   - starts or restarts the workspace environment
3. `lifecycle workspace reset`
   - resets the workspace baseline and restarts the environment
4. `lifecycle workspace destroy`
   - tears the environment down and removes the durable workspace

#### Workspace Observability

1. `lifecycle workspace status [--json]` -- workspace metadata, environment status, git ref/sha, mode, all services with ports and health
2. `lifecycle workspace logs <service> [--tail <n>] [--since <duration>] [--grep <pattern>] [--follow] [--json]`
3. `lifecycle workspace health [--json]` -- run health checks on demand, report per-service results
4. `lifecycle context [--json]` -- one-shot structured dump of workspace metadata, environment status, git info, services, ports, health, preview URLs. Designed for agent consumption; outputs structured format by default.

#### Services

1. `lifecycle service list [--json]`
2. `lifecycle service info <service> [--json]`
3. `lifecycle service start [service...]`
4. `lifecycle service stop [service...]`
5. `lifecycle service logs <service> [--tail <n>] [--since <duration>] [--grep <pattern>] [--follow] [--json]`
6. `lifecycle service health [service...] [--json]`
7. `lifecycle service set --service <name> [--share on|off] [--port <port>]`

#### Terminals

1. `lifecycle terminal start [--workspace <id>] [--harness claude|codex|...]`
2. `lifecycle terminal status [terminal-id] [--json]`

#### Desktop Shell

1. `lifecycle tab open --surface browser --url <url> [--select] [--split]`
2. `lifecycle tab open --surface file --file-path <path> [--select] [--split]`
3. `lifecycle tab open --surface terminal [--terminal-id <id>] [--harness claude|codex|shell] [--select] [--split]`
4. `lifecycle tab open --surface commit-diff --commit-sha <sha> [--focus-path <path>]`
5. `lifecycle tab open --surface pull-request --pull-request-number <n>`
6. `lifecycle browser snapshot [--json]`
7. `lifecycle browser reload`

#### Local Provider

> No daemon commands -- the Tauri desktop app manages local workspaces directly.

### Session Launch Contract

When the desktop app launches a harness or shell session that should be able to call `lifecycle`, it injects a stable local session context.

Required environment variables:

1. `LIFECYCLE_WORKSPACE_ID`
2. `LIFECYCLE_PROJECT_ID`
3. `LIFECYCLE_TERMINAL_ID`
4. `LIFECYCLE_WORKSPACE_PATH`
5. `LIFECYCLE_CLI_PATH`
6. `LIFECYCLE_BRIDGE`
7. `LIFECYCLE_BRIDGE_SESSION_TOKEN`

Rules:

1. `cwd` should still be the workspace worktree so commands continue to work when env injection is incomplete.
2. `LIFECYCLE_BRIDGE` identifies the local bridge endpoint the CLI uses to reach the running desktop app.
3. `LIFECYCLE_CLI_PATH` points at the resolved local `lifecycle` executable, and the app should also prepend its parent directory to `PATH`.
4. `LIFECYCLE_BRIDGE_SESSION_TOKEN` is a short-lived capability token for bridge-driven shell operations initiated from the session.
5. CLI commands must not require the caller to pass `--workspace` or `--terminal` when this context is present.
6. Shell commands must fail clearly when the bridge or session token is missing or invalid.

### Agent Test Workflow

The primary M5 agent loop should be explicit and boring:

1. agent edits files in the workspace
2. agent runs `lifecycle context`
3. agent runs `lifecycle service info <service> --json`
4. agent runs `lifecycle service start <service>` if the target service is not already ready
5. agent runs `lifecycle tab open --surface browser --url <preview-url>`
6. agent runs `lifecycle browser snapshot --json`
7. agent decides whether the change passed based on the same workspace/browser surfaces the user sees

Rules:

1. Service commands own runtime readiness; they should not be hidden behind browser commands.
2. Browser commands own visual inspection; they should not start or stop services implicitly.
3. Hybrid commands may compose boundaries, but the composed owners must remain explicit in the implementation.

### Design Principles

- **No IDs in common flows**: auto-detect workspace from cwd, project from workspace. IDs are escape hatches, not the default path.
- **Quiet by default**: commands print only what you need. No banners, no tips, no emoji. `--verbose` for debug output.
- **Stable `--json` contracts**: once a `--json` shape ships, it's a public API. Additive changes only.
- **Agent-friendly, human-first**: default output is for humans. `--json` is for agents and scripts. Both are first-class.
- **Desktop-aware when available**: commands that affect app UI go through the bridge, not through ad hoc browser automation.

## Desktop App Surface

No new persistent app surfaces in M5 -- the CLI is the primary interface for this milestone. M5 does introduce a local bridge so a session can drive existing workspace, tab, and browser surfaces in the running app.

## Exit Gate

- `cd` into a workspace worktree -> `lifecycle workspace status` -> see full dashboard without passing any IDs
- `lifecycle workspace logs api --tail 20 --grep error` -> see recent API errors, formatted and readable
- `lifecycle workspace health --json` -> structured health check results an agent can parse
- `lifecycle context` -> one-shot structured dump of everything about the current workspace
- Agent running in terminal can call `lifecycle context` and immediately understand the environment
- Agent running in a desktop-launched session can call `lifecycle service info api`, `lifecycle tab open --surface browser --url <preview-url>`, and `lifecycle browser snapshot`
- `lifecycle workspace create --local` -> workspace created and reaches active
- `lifecycle workspace destroy` -> workspace destroyed

## Test Scenarios

```
cd into worktree -> lifecycle workspace status -> shows correct workspace without --workspace flag
cd into non-worktree -> lifecycle workspace status -> clear error: "not inside a workspace worktree"
lifecycle workspace status --json -> valid JSON with workspace metadata, environment status, services, git info
lifecycle workspace logs api --tail 10 -> last 10 lines of api service output
lifecycle workspace logs api --json -> newline-delimited JSON log entries
lifecycle workspace health -> table of service health check results with pass/fail
lifecycle context -> structured workspace context dump
lifecycle workspace create --local -> workspace reaches active
lifecycle workspace run -> services restart
lifecycle workspace reset -> data re-seeded, services restart
lifecycle workspace destroy -> workspace removed
lifecycle terminal start -> terminal session started
lifecycle service info api --json -> returns service state for the current workspace without passing --workspace
lifecycle service start api -> starts the target service chain for the current workspace
lifecycle tab open --surface browser --url http://localhost:3000 -> running desktop app opens or focuses a workspace browser surface
lifecycle browser snapshot --json -> structured snapshot result for the currently targeted browser surface
lifecycle tab open --surface browser ... (desktop app unavailable) -> typed local_app_not_running error with suggested next step
lifecycle workspace status (no workspace running) -> clear error with suggested next step
lifecycle --help -> concise command map
lifecycle workspace --help -> workspace subcommands with examples
```

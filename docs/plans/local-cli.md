# Plan: Local CLI

> Status: planned execution plan
> Depends on: [M4 workspace environments](../milestones/4-workspace-environments.md)
> Plan index: [docs/plans/README.md](./README.md). This document is the target contract for the local CLI workstream.
> Current execution focus: this plan and [TUI](../reference/tui.md) define the main build lane right now. Desktop RPC ideas remain secondary unless they directly unblock CLI/TUI work.

## Goal

A developer (or agent) working inside a project root or workspace checkout can use the Lifecycle CLI through a stable singular noun model: `project` scaffolds the checked-in contract, `workspace` materializes a concrete working instance, `stack` operates the live runnable graph inside that workspace, `service` targets one node inside the stack, and `context` emits the aggregate machine-readable view. The current surface priority is shell/runtime control and TUI-oriented workflows. Desktop RPC commands are explicitly secondary. No cloud, no auth, no network.

## Bridge-First Rule

The CLI should be a bridge client for runtime operations.

Rules:

1. The CLI asks the bridge to read or mutate workspace runtime state.
2. The CLI does not reimplement host-runtime authority in leaf commands when the bridge is available.
3. The bridge returns authoritative responses and streams lifecycle events for long-running state changes.
4. CLI command families keep the filesystem noun tree, but their runtime handlers should map onto bridge operations consistently.

## Canonical Noun Model

The CLI should use singular nouns consistently.

1. `project` -- the durable project contract on disk; owns `lifecycle.json`
2. `workspace` -- a concrete working instance of a project
3. `stack` -- the live runnable graph for a workspace
4. `service` -- one named node inside the stack
5. `context` -- the one-shot aggregate machine-readable read

Rules:

1. Namespaces stay singular: `project`, `workspace`, `stack`, `service`
2. Plurality lives in verbs or arguments: `service list`, `service start api web`
3. Use `environment` for the declarative graph in `lifecycle.json`; use `stack` for the live operational surface in the CLI
4. Use `workspace` for materialization and durable identity; do not overload it with stack runtime verbs

## What You Build

1. **Workspace context auto-detection**: when cwd is inside a workspace worktree, `workspace`, `stack`, and `service` commands auto-resolve the current workspace without `--workspace <id>`. Explicit `--workspace` overrides.
2. **Project commands**:
   - `lifecycle project init` scaffolds a valid `lifecycle.json` starter from the current project when possible
3. **Workspace commands**:
   - `lifecycle workspace create --project <id> --ref <branch> --local`
   - `lifecycle workspace prepare`
   - `lifecycle workspace status`
   - `lifecycle workspace destroy`
4. **Stack commands**:
   - `lifecycle stack run`
   - `lifecycle stack stop`
   - `lifecycle stack reset`
   - `lifecycle stack status`
   - `lifecycle stack logs`
   - `lifecycle stack health`
5. **Service commands**:
   - `lifecycle service list`
   - `lifecycle service info <service>`
   - `lifecycle service logs <service>`
   - `lifecycle service start [service...]`
   - `lifecycle service stop [service...]`
6. **Context command** (designed for agents):
   - `lifecycle context` dumps everything an agent needs to orient: workspace metadata, stack status, git info, all services with ports/health/preview URLs, and available CLI capabilities. Structured, dense, one-shot.
7. **Output conventions**: every read command supports `--json` for structured, parseable output (agent-friendly). Default output is pretty-printed for humans -- compact, scannable, no noise. `--json` output contracts are stable and documented.
8. **Desktop shell commands** (agent-visible app control):
   - `lifecycle tab open --surface browser --url <url>` -- open or focus a browser surface in the current workspace
   - `lifecycle tab open --surface terminal [--harness claude|codex|shell]` -- open or focus a terminal surface in the current workspace
   - `lifecycle browser snapshot` -- capture the current browser surface for agent inspection
   - shell commands are only available when the CLI can reach the running desktop app
9. **Help and discoverability**: every subcommand has `--help` with examples. `lifecycle` with no args opens the TUI, and `lifecycle bridge start` starts the Lifecycle bridge. Error messages suggest the right command when possible.

## Implementation Contracts

### Boundary Model

The CLI is one surface over four distinct authority boundaries:

1. `project` -- project contract, manifest scaffold/read, and project lookup
2. `workspace` -- workspace identity, checkout/materialization, preparation, and durable workspace lifecycle
3. `stack` -- live runtime graph control inside an existing workspace
4. `desktop shell` -- tabs, panes, browser surfaces, focus, selection, and visual capture inside the running desktop app

Ownership and hosting are intentionally separate:

1. Project-local manifest commands can run directly in the CLI process.
2. Desktop-owned shell commands still require the running desktop app.
3. That does **not** collapse everything into one API blob. Commands still route to one authoritative owner.
4. Future cloud work may move `project`, `workspace`, and `stack` authority off-device while keeping `desktop shell` local.

### User-Facing Command Taxonomy

User-facing command families should optimize for the acted-on thing, not mirror implementation package names exactly.

1. `project` -- project contract and setup commands
2. `workspace` -- workspace lifecycle and materialization commands
3. `stack` -- whole-graph runtime commands for the current workspace
4. `service` -- single-node runtime commands for the current workspace
5. `tab` -- desktop-shell-owned surface placement and focus commands
6. `browser` -- desktop-shell-owned browser surface commands like snapshot and reload
7. `context` -- aggregate agent-facing read that composes project, workspace, stack, and desktop-shell facts when available

This gives the CLI a simple user mental model:

1. If the command authors or scaffolds the checked-in contract, it belongs under `project`.
2. If the command materializes or mutates a concrete workspace instance, it belongs under `workspace`.
3. If the command acts on the live runtime graph as a whole, it belongs under `stack`.
4. If the command targets one runtime node, it belongs under `service`.
5. If the command changes what the user sees in the app, it belongs under `tab` or `browser`.

Examples:

1. `lifecycle project init` -> project
2. `lifecycle workspace create` -> workspace
3. `lifecycle workspace prepare` -> workspace
4. `lifecycle stack run` -> stack
5. `lifecycle service info api --json` -> stack-scoped service read
6. `lifecycle tab open --surface browser --url http://localhost:3000` -> desktop shell
7. `lifecycle browser snapshot --json` -> desktop shell

Cloud extensions layer additional command families on top of this local core:

1. `auth` -- cloud sign-in
2. `org` -- organization create/switch and cloud-account setup
3. `repo` -- repository linking for GitHub-backed flows
4. `agent` -- shell-first provider launcher for cloud workspaces
5. `pr` -- backend-owned pull request create/merge actions

Those families are out of scope for M5 itself, but they should reuse the same noun model rather than introducing a parallel CLI grammar.

### Local Hosting Model

For local mode in M5, the CLI has two explicit operating modes.

1. **Standalone project/workspace mode**: `project init`, `workspace prepare`, manifest discovery, and other project-local commands operate directly from the checkout and do not require the desktop app.
2. **Desktop RPC mode**: `tab` and `browser` commands require the desktop app because they target app-local UI state.
3. `stack` and `service` commands should work through the bridge without assuming "desktop already launched me" is the normal case.
4. When a command explicitly needs the desktop app and it is unavailable, it fails with a typed `local_app_not_running` error instead of silently degrading.

### Integration Architecture

The CLI is the primary local control surface. MCP may wrap it later, but M5 should treat the CLI as the canonical command contract and avoid building a second parallel local-control API first.

#### Current Shipped Slice

The currently shipped local slice is intentionally narrow and pre-taxonomy:

1. command discovery/help generation through `@lifecycle/cmd`
2. manifest discovery and validation from the current checkout
3. `lifecycle repo init` as the current implementation precursor to `lifecycle project init`
4. `lifecycle prepare` as the current implementation precursor to `lifecycle workspace prepare`

The canonical interface in this document is `project -> workspace -> stack -> service`. The checked-in CLI still carries older names until that taxonomy is landed end-to-end.

#### Request Routing

Every CLI command resolves to one of four handler paths:

1. `project` handler -- project contract and scaffold verbs
2. `workspace` handler -- workspace materialization and durable lifecycle verbs
3. `stack` handler -- runtime graph verbs, including service-scoped operations
4. `desktop shell` handler -- pane, tab, browser, focus, and snapshot verbs

Routing rule:

1. `project *` routes to project handlers
2. `workspace create|prepare|destroy|status` route to workspace handlers
3. `stack *` routes to stack handlers
4. `service *` routes to stack handlers with service-level scope
5. `tab *` and `browser *` route to desktop-shell handlers
6. `context` may compose project, workspace, stack, and desktop-shell facts

#### Local Desktop RPC

The desktop app exposes one local request/response RPC channel for CLI access.

1. Transport: local-only socket or named pipe, not HTTP
2. Serialization: versioned JSON request/response envelope
3. Scope: one desktop rpc per running desktop app instance
4. Discovery:
   - Lifecycle-launched sessions use `LIFECYCLE_DESKTOP_SOCKET`
   - external-shell descriptor discovery is still deferred

The desktop rpc exists to let the CLI talk to the running app process. It is not a second user-facing API surface.

#### Desktop RPC Envelope

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

Inside the desktop app, the desktop rpc splits again by ownership.

1. Rust/Tauri handles `workspace` and `stack` requests directly using the same underlying capabilities the app already uses for Tauri invokes, plus any `desktop/rpc`-routed project reads that cannot be satisfied in the CLI process.
2. Rust/Tauri also terminates the socket gateway and enforces session/token validation.
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

1. `workspace`, `stack`, and `service` commands use session env plus cwd to resolve the current workspace.
2. `tab` and `browser` commands additionally use the injected desktop rpc socket path and session token.
3. The session token scopes what the harness is allowed to control through the desktop rpc.
4. Session-initiated shell commands should default to the current workspace tab, not global app navigation.

#### Recommended Implementation Layout

Keep the implementation split by concern instead of burying everything in the CLI package.

1. `packages/cli` -- command parsing, help, output formatting, command-family routing
2. `apps/desktop/src-tauri/src/capabilities/...` -- desktop rpc listener plus workspace/stack request handlers
3. `apps/desktop/src/features/workspaces/...` -- frontend shell request handlers for tab open, focus, browser reload, and browser snapshot
4. shared request/response schemas should live with other typed contracts, not as ad hoc JSON in the CLI

#### Non-Goals

1. No separate local daemon in M5
2. No browser-automation-only testing path for local app surfaces
3. No duplicate “CLI API” beside the desktop rpc envelope
4. No requirement that MCP bypass the CLI; wrapping the CLI is acceptable as long as the CLI contract stays canonical

### Full Command Surface (Local)

#### Global Conventions

1. **Workspace context auto-detection**: when cwd is inside a workspace worktree, all `workspace`, `stack`, and `service` commands auto-resolve the workspace. Explicit `--workspace <id>` overrides.
2. **`--json` flag**: every read command supports `--json` for stable, structured output. Default output is human-readable.
3. **Quiet defaults**: no banners, no tips, no emoji. `--verbose` for debug output.
4. **Error style**: errors include the failed command, reason, and suggested next step.
5. **Resolution order**: explicit flags win, then session-injected Lifecycle env vars, then cwd-based auto-detection.

#### Project

1. `lifecycle project init`
   - scaffold or repair `lifecycle.json` for the current project
2. `lifecycle project inspect [--json]`
   - deferred; project-level metadata and manifest summary read

#### Workspace

1. `lifecycle workspace create --project <id> --ref <branch> [--local]`
   - default: `--local` from CLI (cloud mode deferred to M6)
2. `lifecycle workspace prepare`
   - run `workspace.prepare` for the current workspace checkout
3. `lifecycle workspace status [--json]`
   - workspace identity, checkout/materialization facts, and current stack summary
4. `lifecycle workspace destroy`
   - tear down the workspace and remove the durable workspace record
5. `lifecycle workspace list [--json]`
   - deferred; list known workspaces for the current project or machine

#### Stack

1. `lifecycle stack run`
   - start or reconcile the whole stack to running
2. `lifecycle stack stop`
   - stop the whole stack cleanly
3. `lifecycle stack reset`
   - restore the workspace baseline and restart the stack
4. `lifecycle stack status [--json]`
   - whole-stack runtime summary: status, health, ports, previews, and readiness
5. `lifecycle stack logs [--tail <n>] [--since <duration>] [--grep <pattern>] [--follow] [--json]`
   - aggregate logs across the stack; each line includes the service label
6. `lifecycle stack health [--json]`
   - run stack-wide health checks on demand and report per-service results

#### Services

1. `lifecycle service list [--json]`
2. `lifecycle service info <service> [--json]`
3. `lifecycle service start [service...]`
4. `lifecycle service stop [service...]`
5. `lifecycle service logs <service> [--tail <n>] [--since <duration>] [--grep <pattern>] [--follow] [--json]`
6. `lifecycle service health [service...] [--json]`
7. `lifecycle service set --service <name> [--share on|off] [--port <port>]`

#### Context

1. `lifecycle context [--json]`
   - one-shot structured dump of project, workspace, stack, service, git, and desktop-shell facts
   - designed for agent consumption; default output is a compact human-readable summary and `--json` returns the stable structured contract

#### Desktop Shell

1. `lifecycle tab open --surface browser --url <url> [--select] [--split]`
2. `lifecycle tab open --surface file --file-path <path> [--select] [--split]`
3. `lifecycle tab open --surface terminal [--terminal-id <id>] [--harness claude|codex|shell] [--select] [--split]`
4. `lifecycle tab open --surface commit-diff --commit-sha <sha> [--focus-path <path>]`
5. `lifecycle tab open --surface pull-request --pull-request-number <n>`
6. `lifecycle browser snapshot [--json]`
7. `lifecycle browser reload`

#### Local Provider

> Project-local flows start from `lifecycle.json` plus the CLI. Desktop-owned surfaces are additive.

### Session Launch Contract

When the desktop app launches a harness or shell session that should be able to call `lifecycle`, it injects a stable local session context.

Required environment variables:

1. `LIFECYCLE_WORKSPACE_ID`
2. `LIFECYCLE_PROJECT_ID`
3. `LIFECYCLE_WORKSPACE_PATH`
4. `LIFECYCLE_CLI_PATH`
5. `LIFECYCLE_DESKTOP_SOCKET`
6. `LIFECYCLE_DESKTOP_SESSION_TOKEN`

Rules:

1. `cwd` should still be the workspace worktree so commands continue to work when env injection is incomplete.
2. `LIFECYCLE_DESKTOP_SOCKET` identifies the local desktop rpc endpoint the CLI uses to reach the running desktop app.
3. `LIFECYCLE_CLI_PATH` points at the resolved local `lifecycle` executable, and the app should also prepend its parent directory to `PATH`.
4. `LIFECYCLE_DESKTOP_SESSION_TOKEN` is a short-lived capability token for `desktop/rpc`-driven shell operations initiated from the session.
5. CLI commands must not require the caller to pass `--workspace` when this context is present.
6. Shell commands must fail clearly when the bridge or session token is missing or invalid.

### Agent Test Workflow

The primary M5 agent loop should be explicit and boring:

1. agent edits files in the workspace
2. agent runs `lifecycle context`
3. agent runs `lifecycle stack status --json`
4. agent runs `lifecycle service info <service> --json`
5. agent runs `lifecycle service start <service>` if the target service is not already ready
6. agent runs `lifecycle tab open --surface browser --url <preview-url>`
7. agent runs `lifecycle browser snapshot --json`
8. agent decides whether the change passed based on the same workspace/browser surfaces the user sees

Rules:

1. Service commands own runtime readiness; they should not be hidden behind browser commands.
2. Browser commands own visual inspection; they should not start or stop services implicitly.
3. Hybrid commands may compose boundaries, but the composed owners must remain explicit in the implementation.

### Design Principles

- **No IDs in common flows**: auto-detect workspace from cwd, project from workspace. IDs are escape hatches, not the default path.
- **Quiet by default**: commands print only what you need. No banners, no tips, no emoji. `--verbose` for debug output.
- **Stable `--json` contracts**: once a `--json` shape ships, it's a public API. Additive changes only.
- **Agent-friendly, human-first**: default output is for humans. `--json` is for agents and scripts. Both are first-class.
- **Desktop-aware when available**: commands that affect app UI go through the desktop rpc, not through ad hoc browser automation.

## Desktop App Surface

No new persistent app surfaces in M5 -- the CLI is the primary interface for this milestone. M5 may still use a local desktop rpc so a session can drive existing workspace, tab, and browser surfaces in the running app when those surfaces are present.

## Exit Gate

- `cd` into a workspace worktree -> `lifecycle workspace status` -> see workspace identity without passing any IDs
- `cd` into a workspace worktree -> `lifecycle stack status` -> see the full stack dashboard without passing any IDs
- `lifecycle stack logs --tail 20 --grep error` -> see recent stack errors, formatted and readable
- `lifecycle stack health --json` -> structured health check results an agent can parse
- `lifecycle context` -> one-shot structured dump of everything about the current workspace
- Agent running in terminal can call `lifecycle context` and immediately understand the environment
- Agent running in a desktop-launched session can call `lifecycle service info api`, `lifecycle tab open --surface browser --url <preview-url>`, and `lifecycle browser snapshot`
- `lifecycle workspace create --local` -> workspace created and reaches active
- `lifecycle workspace prepare` -> workspace bootstrap work completes from the current checkout
- `lifecycle workspace destroy` -> workspace destroyed

## Test Scenarios

```
cd into worktree -> lifecycle workspace status -> shows correct workspace without --workspace flag
cd into worktree -> lifecycle stack status -> shows correct stack without --workspace flag
cd into non-worktree -> lifecycle stack status -> clear error: "not inside a workspace worktree"
lifecycle project init -> creates or repairs lifecycle.json for the project
lifecycle workspace prepare -> runs workspace.prepare for the current workspace
lifecycle workspace status --json -> valid JSON with workspace identity, checkout, and stack summary
lifecycle stack logs --tail 10 -> recent aggregate stack logs with service labels
lifecycle stack logs --json -> newline-delimited JSON log entries with service labels
lifecycle stack health -> table of service health check results with pass/fail
lifecycle context -> structured workspace context dump
lifecycle workspace create --local -> workspace reaches active
lifecycle stack run -> services start or reconcile to running
lifecycle stack stop -> services stop cleanly
lifecycle stack reset -> data re-seeded, services restart
lifecycle workspace destroy -> workspace removed
lifecycle service info api --json -> returns service state for the current workspace without passing --workspace
lifecycle service start api -> starts the target service chain for the current workspace
lifecycle tab open --surface browser --url http://localhost:3000 -> running desktop app opens or focuses a workspace browser surface
lifecycle browser snapshot --json -> structured snapshot result for the currently targeted browser surface
lifecycle tab open --surface browser ... (desktop app unavailable) -> typed local_app_not_running error with suggested next step
lifecycle stack status (no workspace running) -> clear error with suggested next step
lifecycle --help -> concise command map
lifecycle workspace --help -> workspace subcommands with examples
lifecycle stack --help -> stack subcommands with examples
```

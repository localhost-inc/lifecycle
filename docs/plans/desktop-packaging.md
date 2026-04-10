# Plan: Desktop Packaging

> Status: planned execution plan
> Depends on: [CLI](./cli.md), [Runtime Boundaries](./runtime-boundaries.md), [Terminals](./terminals.md), [Mac Presentation Boundaries](./mac-presentation-boundaries.md)
> Plan index: [docs/plans/README.md](./README.md)
> Current execution focus: desktop-mac is not the primary repo lane, but this plan defines the packaging contract required before the app can be distributed outside repo-backed development.

## Goal

Make `apps/desktop-mac` shippable as a production `Lifecycle.app`.

The packaged app must launch and supervise the local bridge and expose the Lifecycle CLI contract to workspace shells and agent tooling without requiring:

1. a repository checkout
2. a globally installed `lifecycle`
3. a developer shell environment

## Product Rules

Packaging must preserve the bridge-first contract.

Rules:

1. The desktop app is still a bridge client. Packaging does not move runtime authority into Swift.
2. The packaged app owns the local bridge process as an app-bundled runtime helper.
3. The packaged app also owns the bundled `lifecycle` CLI path used by workspace shells, agent workers, and MCP integrations.
4. User-facing bridge control remains the CLI surface: `lifecycle bridge start`, `lifecycle bridge stop`, and `lifecycle bridge status`.
5. The app must not rely on `PATH` to discover the bundled bridge or bundled CLI.
6. Type-only development edges do not expand the production runtime closure. In particular, `@lifecycle/control-plane` is not part of the packaged desktop runtime.
7. Packaging must not fork the runtime state model by accident. If state roots change, migration must be explicit.
8. Only three top-level packaged artifacts ship: the app, the bridge helper, and the CLI helper.
9. The TUI ships inside the CLI distribution boundary, not as a separate packaged helper.
10. `@lifecycle/cmd` is an implementation detail of the CLI build, not a separate packaged artifact boundary.

## Current Packaging Gaps

The repo is not production-packaged yet because of these current behaviors:

1. The app starts production bridge processes via `lifecycle bridge start` from ambient `PATH`.
2. The CLI assumes Bun execution and repo-relative command/module layout.
3. The CLI no-arg path launches the TUI and currently discovers the TUI binary relative to a repo checkout.
4. Finder-launched app processes do not inherit the same shell environment as repo dev loops.
5. Local runtime commands still rely on ambient discovery of external tools such as `git`, `ssh`, and `tmux`.
6. The current desktop build emits only the app bundle; it does not stage a curated runtime payload.

## Runtime Closure

The packaged desktop runtime consists of the app plus the local runtime artifacts it directly executes.

### Included

1. `apps/desktop-mac` executable and resources
2. bundled bridge runtime artifact
3. bundled CLI runtime artifact
4. any JS runtime support needed to execute bridge and CLI artifacts, embedded inside those artifacts instead of shipped as a standalone packaged helper
5. bridge/CLI runtime code and dependencies needed inside those packaged artifacts:
   - `packages/bridge`
   - `packages/cli`
   - `packages/contracts`
   - `packages/db`
   - `packages/agents`
6. bridge OpenAPI artifact
7. packaging manifest and helper version metadata

### Excluded

1. `apps/control-plane`
2. type-only `@lifecycle/control-plane/rpc` references used for Hono client inference
3. repo dev scripts and monorepo supervisor glue
4. source-only or test-only artifacts not required at runtime
5. standalone `cmd` packaging output
6. standalone `tui` helper packaging output

## Bundle Contract

The app bundle should stage runtime helpers explicitly.

Recommended shape:

```text
Lifecycle.app/
  Contents/MacOS/
    lifecycle-macos
  Contents/Helpers/
    lifecycle-bridge
    lifecycle-cli
  Contents/Resources/
    LifecycleMac_LifecycleApp.bundle
    lifecycle-runtime/
      bridge/
      cli/
      contracts/
      db/
      agents/
      node_modules/
      openapi.json
      runtime-manifest.json
```

Rules:

1. Swift resolves bundled helper paths from the app bundle, not from `PATH`.
2. The desktop app launches the bundled bridge helper by absolute path.
3. The bundled CLI must include or resolve its baked-in TUI payload without depending on a repo checkout or a standalone packaged TUI helper.
4. Diagnostics should report the resolved helper paths and versions.

## Runtime Roots

Packaging should preserve the current Lifecycle runtime roots first, then migrate only if needed.

V1 rule:

1. Continue using `~/.lifecycle` for durable shared state and compatibility with existing CLI/bridge behavior.
2. Use app-specific cache/log/staging locations under the macOS app support or cache directories only for desktop-owned transient data.

Non-goal for V1:

1. Do not move credentials, settings, workspace state, and bridge registration into a new app-only root unless a migration plan ships in the same change.

## Bridge Supervision Contract

The packaged app should supervise the same bridge runtime that the CLI surface controls.

Rules:

1. `lifecycle bridge start` remains the public bridge contract.
2. Internally, the app may launch a dedicated bundled bridge helper instead of routing startup through a shell command.
3. CLI `bridge start|stop|status` and desktop supervision must converge on the same registration file and health endpoint.
4. The app must reconnect when the bridge registration or pid changes.
5. Production startup must not depend on repo-root environment variables or monorepo-only bootstrap paths.

Preferred implementation:

1. Ship a dedicated bundled `lifecycle-bridge` helper.
2. Keep CLI bridge commands as the stable public interface over the same underlying bridge server code.

## Bundled CLI Contract

The packaged app must expose a canonical bundled CLI path.

Rules:

1. The app injects `LIFECYCLE_CLI_PATH` for bridge child processes, workspace shells, and agent workers.
2. Agent provider integrations that spawn Lifecycle MCP must use the bundled CLI path, not ambient `PATH`.
3. The bundled CLI must support the same user-facing grammar as the repo CLI.
4. If `lifecycle` is run with no subcommand from a packaged environment, it must still be able to launch the TUI through the CLI’s own bundled distribution.
5. The packaged CLI may absorb `@lifecycle/cmd` and TUI assets internally, but those do not become separate packaged artifacts.

## Environment Hydration

GUI-launched production apps need explicit startup environment hydration.

Rules:

1. On startup, the app captures a bounded login-shell environment snapshot.
2. The app merges that snapshot into the process environment before bridge bootstrap and terminal-adjacent work.
3. Bundled helper directories are prepended ahead of hydrated `PATH`.
4. Environment hydration failures are logged in diagnostics and surfaced clearly when they break tool discovery.
5. Hydration is not a substitute for workspace-scoped env injection. Those remain explicit runtime contracts.

## External Dependency Policy

The desktop app should bundle Lifecycle-owned binaries first and leave generic developer tools external in V1.

### Bundled in V1

1. bridge helper
2. CLI helper
3. any bridge/CLI runtime support required to execute those helpers, embedded within them instead of shipped as a fourth top-level artifact

### External in V1

1. `git`
2. `ssh`
3. `tmux`
4. language runtimes and project toolchains

Rules:

1. Missing external dependencies must fail loudly with actionable diagnostics.
2. Finder launch must not make these tools less discoverable than repo development mode.
3. Bundling `tmux` is a follow-up option, not a prerequisite for the first production packaging milestone.

## Packaging Pipeline

The desktop packaging pipeline needs a real runtime staging step.

### Build outputs

1. native app bundle
2. bridge runtime helper
3. CLI runtime helper with baked-in TUI support
4. runtime payload manifest

### Required build work

1. create a desktop runtime staging script that assembles only the production runtime closure
2. make bridge and CLI executable in a packaged environment
3. bake TUI support into the packaged CLI instead of relying on a separate packaged TUI helper or repo-relative binaries
4. copy staged runtime artifacts into the app bundle before signing
5. sign nested helpers and the final app bundle in the correct order
6. add zipped app or DMG packaging as a final distribution layer after launch validation is stable

## Implementation Phases

### Phase 1: Packaging Contract

1. land this plan
2. add a bundle runtime resolver in Swift
3. surface bundled helper paths in diagnostics
4. define a runtime manifest schema for packaged artifacts

Acceptance:

1. the app can report which helper paths it would use in production
2. diagnostics clearly distinguish repo-dev mode from packaged mode

### Phase 2: Bundled Bridge Startup

1. replace production PATH-based bridge startup with bundle-resolved startup
2. preserve current repo-dev startup behavior behind `LIFECYCLE_DEV=1`
3. ensure bridge registration and reconnect behavior still work

Acceptance:

1. launching the packaged app starts a healthy local bridge without global `lifecycle`
2. bridge restart and reconnect work from the desktop app

### Phase 3: Bundled CLI Runtime

1. bundle a CLI helper and inject `LIFECYCLE_CLI_PATH`
2. bake TUI support into the CLI distribution
3. remove repo-relative packaged TUI discovery assumptions
4. verify agent workers and MCP integrations use the bundled CLI

Acceptance:

1. a workspace shell can run `lifecycle context`
2. agent flows that rely on Lifecycle MCP resolve the bundled CLI path
3. `lifecycle` with no args can launch the TUI from the packaged CLI

### Phase 4: Environment Hydration and Dependency Diagnostics

1. add startup-time login-shell environment hydration
2. prepend bundled helper paths to `PATH`
3. add explicit dependency checks for `git`, `ssh`, and `tmux`
4. add first-run diagnostics or settings visibility for missing dependencies

Acceptance:

1. Finder-launched app behavior matches dev-loop expectations closely enough for shell and bridge workflows
2. missing dependencies produce clear, actionable errors

### Phase 5: Distribution Readiness

1. sign nested helpers
2. sign app bundle
3. notarize
4. package for internal distribution
5. run clean-machine smoke tests

Acceptance:

1. signed packaged app launches on a clean machine
2. notarized artifact passes Gatekeeper
3. smoke-test matrix passes

## Smoke Test Matrix

Before shipping, validate at least these cases:

1. clean Mac, no repo checkout, no global `lifecycle`
2. Finder launch starts bridge successfully
3. desktop app reconnects after bridge restart
4. open workspace shell and run `lifecycle context`
5. create or attach terminal surfaces successfully
6. launch TUI from bundled CLI with no separate packaged TUI helper
7. run agent flow that depends on Lifecycle MCP
8. validate clear failure when `tmux` is missing
9. export diagnostics bundle and confirm helper metadata is included

## Non-Goals

This plan does not require:

1. bundling the control plane server
2. changing the bridge-first authority model
3. moving desktop semantics into Swift
4. bundling all developer toolchains
5. changing cloud packaging or control-plane deployment

## Recommended First Slice

The first implementation slice should be:

1. add bundled runtime path resolution in Swift
2. replace production bridge startup with a bundle-resolved helper launch
3. add a desktop runtime staging script
4. emit helper path/version diagnostics

Reason:

1. it replaces the most fragile production assumption first
2. it validates the bundle layout without needing to solve the entire CLI/TUI packaging problem in one change
3. it gives future work a stable runtime boundary to build on

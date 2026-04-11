# Plan: Desktop Packaging

> Status: active execution plan
> Depends on: [CLI](./cli.md), [Runtime Boundaries](./runtime-boundaries.md), [Terminals](./terminals.md)
> Plan index: [docs/plans/README.md](./README.md)

## Goal

Ship `apps/desktop-mac` as a production `Lifecycle.app` without requiring:

1. a repo checkout
2. a globally installed `lifecycle`
3. Bun or any other developer shell bootstrap on the target machine

## Packaging Contract

The desktop app stays a bridge client. Packaging does not move runtime authority into Swift.

V1 contract:

1. Ship one top-level artifact: `Lifecycle.app`.
2. Embed one CLI helper payload inside the app bundle under `Contents/Helpers/`.
3. Start the local bridge by launching the bundled CLI with `lifecycle bridge start`.
4. Do not ship a separate bridge helper artifact.
5. Do not ship the TUI in the desktop packaging path for now.
6. Do not ship first-party custom-agent tooling in the desktop packaging path.
7. Do not rely on `PATH` to find Lifecycle-owned executables.

## Current Runtime Shape

The bundle now stages:

```text
Lifecycle.app/
  Contents/MacOS/
    Lifecycle
  Contents/Helpers/
    bun
    lifecycle
    lifecycle.js
    node_modules/
      @tursodatabase/
        sync-darwin-arm64/
```

Rules:

1. `Contents/Helpers/lifecycle` is the canonical bundled helper path.
2. `Contents/Helpers/bun` is bundled only as an implementation detail of that helper payload.
3. Native runtime dependencies required by the bridge startup path must be staged inside `Contents/Helpers/node_modules`.
4. `apps/cli/src/bridge/openapi.json` is the bridge spec source for the desktop app.

## Runtime Roots

V1 runtime roots stay conservative:

1. Durable shared state remains under `~/.lifecycle`.
2. Desktop-only transient caches and logs may live under app-owned cache locations.
3. Packaging must not silently fork credentials, settings, or bridge registration into a new root.

## External Dependency Policy

Lifecycle-owned runtime pieces are bundled. Generic developer tools remain external in V1.

Bundled:

1. desktop app executable and resources
2. bundled CLI helper payload
3. runtime support needed by that helper payload

External:

1. `git`
2. `ssh`
3. `tmux`
4. language runtimes and project toolchains

Rule:

1. Missing external dependencies must fail loudly with actionable diagnostics.

## Build Pipeline

The packaging path is:

1. generate routed bridge files from `apps/cli`
2. build the CLI release payload with `apps/cli/scripts/build-release.ts`
3. copy the full helper payload into `Lifecycle.app/Contents/Helpers`
4. build the native app bundle

## Acceptance

This plan is satisfied when:

1. `./apps/desktop-mac/scripts/build.sh` produces `Lifecycle.app`
2. the embedded helper can run `lifecycle bridge start --help` from inside the app bundle
3. the app resolves the bundled helper by absolute path in packaged mode
4. the packaged desktop contract is `Lifecycle.app` plus bundled CLI helper, with no separate bridge helper and no first-party custom-agent surface

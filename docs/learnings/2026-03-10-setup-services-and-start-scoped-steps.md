# Setup Services And Start-Scoped Steps

## Context

Kin exposed a gap in the local workspace environment model: setup always ran before managed services existed, and setup only ran once per workspace.

That model breaks real projects that need workspace-scoped infra before migrations or emulator bootstrap can run, and it breaks again on restart when local containers are recreated and lose ephemeral state.

## Learning

1. `setup` needs an explicit service bootstrap phase.
2. `setup` also needs per-step cadence, not a single global "once" policy.
3. Local worktree creation must carry forward existing local `.env` and `.env.local` files so untracked developer config does not disappear in derived workspaces.

## Change

1. Added `setup.services` so specific services, plus their transitive dependencies, start before setup.
2. Added `setup.steps[].run_on` with `create` and `start`.
3. Local workspace creation now mirrors existing `.env` and `.env.local` files from the source repo into the managed worktree when the destination path does not already exist.

## Milestone Impact

1. M4 local environment behavior can now model infra-first startup instead of forcing fake side orchestration.
2. M5 sleep/wake durability still needs explicit persistent storage for image services; `run_on=start` restores boot correctness, not data retention.

## Follow-Up

1. Add first-class manifest support for persistent container storage instead of relying on restart-time rebootstrap for all stateful services.
2. Add manifest-native env interpolation so projects do not need long inline shell env assignments in service commands.

# Local Env Files Over Fake Manifest Secrets

## Context

The local V1 manifest still described a managed `secrets` contract and `${secrets.*}` references even though the desktop runtime did not resolve them. That created a fake capability at the contract layer and led directly to misleading docs, invalid examples, and manifests that looked valid while still failing at runtime.

## Decision

Local V1 does not support managed secrets in `lifecycle.json`.

Instead:

1. local credentials remain developer-managed outside the manifest
2. `workspace.setup` owns env-file materialization and local env copying
3. `lifecycle.json` must reject top-level `secrets` declarations
4. `lifecycle.json` must reject `${secrets.*}` references

## Why

1. It keeps the manifest honest about what the local runtime can actually do.
2. It lets Kin and Lifecycle move forward immediately on declarative env-file setup.
3. It avoids baking a second fake secret system into the contract before cloud exists.

## Milestone Impact

1. M1 config parsing/display should show setup and services, not a managed secrets surface.
2. M5/M6 local environment execution should treat env-file setup as first-class workspace setup work.

## Follow-Up

1. Keep env-file setup declarative in `lifecycle.json`; do not reintroduce repo-local Lifecycle helper scripts.
2. Add first-class managed secret injection only when the cloud provider contract is real.

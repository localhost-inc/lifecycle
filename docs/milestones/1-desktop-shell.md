# Milestone 1: "I can open the app and see my project"

> Prerequisites: M0
> Introduces: `project` entity, `lifecycle.json` parsing, Tauri app shell
> Tracker: high-level status/checklist lives in [`docs/plan.md`](../plan.md). This document is the detailed implementation contract.

## Goal

A net-new user downloads the app, opens it, adds a project directory, and sees their project with config status — no account, no network, no setup friction.

## What You Build

1. Tauri app shell (Rust backend + React webview).
2. "Add project" flow — pick a directory from filesystem.
3. `lifecycle.json` JSONC parser + Zod schema validator with field-level errors.
4. Project sidebar with config status (valid/invalid/missing).
5. Local project storage in Tauri SQLite (`tauri-plugin-sql`).

## Entity Contracts

### `project` (universal root)

1. Purpose:
   - universal root entity — every workspace belongs to a project
   - represents a directory on disk with optional `lifecycle.json`
   - exists locally first in Tauri SQLite; optionally synced to Convex when user signs in and joins an organization
   - optionally linked to a `repository` for VCS integration (GitHub push, fork-to-cloud, PR creation)
2. Required fields:
   - `id`
   - `path` (absolute directory path)
   - `name` (derived from directory name)
   - `manifest_path` (default `lifecycle.json`)
   - `manifest_valid` (boolean)
   - `organization_id` (nullable — set when user signs in)
   - `repository_id` (nullable — set when user connects to GitHub)
   - `created_at`, `updated_at`
3. Invariants:
   - unique `path` (locally)
   - `name` is derived from the last segment of `path`
   - `manifest_valid` is recomputed on file watch or manual refresh
   - `repository_id` is auto-detected from git remote origin when possible, with manual override in UI
   - cloud features (fork-to-cloud, PR creation, preview sharing) require `repository_id` to be set

## Implementation Contracts

### `lifecycle.json` Parsing

Full configuration spec: [reference/lifecycle-json.md](../reference/lifecycle-json.md)

Key M1 requirements:

- JSONC-aware parser (`jsonc-parser`, comments and trailing commas permitted)
- Zod v4 schema validation with field-level errors
- Parse and display: `workspace` steps and `environment` node definitions

### Local Storage

- Tauri SQLite (`tauri-plugin-sql`) for project persistence
- Local index: unique (`path`)
- No network or auth required

## Desktop App Surface

- **App shell**: Tauri window with React webview, no login screen
- **"Add project" action**: filesystem directory picker
- **Project sidebar**: project name, `lifecycle.json` status indicator (valid/invalid/missing)
- **Config panel**: parsed environment nodes and workspace steps

## Exit Gate

- App opens instantly, no login screen
- You click "Add project", select your repo directory
- Sidebar shows project name, `lifecycle.json` status (valid with green check, or errors with red indicators)
- Config panel shows parsed environment nodes and workspace steps

## Test Scenarios

```
open app → add directory with valid lifecycle.json → see project in sidebar with green status
open app → add directory with invalid lifecycle.json → see field-level validation errors
open app → add directory with no lifecycle.json → see "No config found" with init prompt
reopen app → project persists from previous session
```

# Harness Session Restore Needs a Single Provider Boundary

Date: 2026-03-07
Milestone: M3

## Context

Restoring a workspace tab after leaving the workspace or relaunching the desktop app exposed two different concerns:

1. local UI restore needs to remember which runtime tab was active
2. harness-backed terminals need enough provider-owned metadata to reopen the same session instead of launching a fresh one

Claude and Codex both support resume flows, but they persist local session metadata in different on-disk formats and locations.

## Learning

1. Harness-specific launch and session-store details belong behind a single provider boundary, not spread through terminal attach, detach, sync, or restore code.
2. The terminal lifecycle should only ask for two provider capabilities:
   - how to launch a new or resumed harness session
   - how to discover a persisted session id for a workspace after first launch
3. Adding a new harness provider should mean registering one provider descriptor, not threading provider conditionals through the rest of the terminal stack.

## Milestone Impact

1. M3: harness tabs can persist enough metadata to reopen the correct Claude or Codex session after the native surface is rebuilt.
2. M3: future harness additions such as OpenCode or Amp can plug into the same terminal lifecycle without another restore-specific refactor.

## Follow-Up Actions

1. Keep future harness additions confined to the provider registry and session-store adapter boundary.
2. If a provider cannot expose a stable local session store, make that limitation explicit instead of adding hidden fallback behavior.

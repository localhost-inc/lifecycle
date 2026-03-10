# Harness Prompt Events From Session Logs

## Context

Native terminal tabs run through the embedded Ghostty surface, so keystrokes do not pass through the browser-side terminal input shim. First-prompt auto-title generation therefore needs an authority source that exists on the native path as well as the completion watcher.

## Learning

1. Prompt-boundary facts for native harness tabs should come from authoritative session logs, not renderer input plumbing.
   - Claude and Codex session logs already record submitted user messages with stable timestamps.
   - The desktop backend can emit `terminal.harness_prompt_submitted` directly from those log lines and trigger auto-title generation at the same boundary.
2. Session-log watchers cannot blindly seek to end-of-file on first attach.
   - Doing so can miss the first prompt or first completion when the log file appears before the watcher resolves its path.
   - Re-reading from the start and filtering lines by terminal launch time preserves prompt-boundary correctness without replaying old resumed-session history as new facts.

## Milestone Impact

1. M3 prompt-boundary titling now aligns with the event contract on the native desktop path.
2. The event foundation remains authoritative for terminal facts even when the terminal surface bypasses browser input handlers.

## Follow-Up Actions

1. Add a native integration test that verifies the first submitted harness prompt emits `terminal.harness_prompt_submitted` before `terminal.harness_turn_completed`.
2. If a browser terminal ever returns, add prompt-submitted parity as part of that separate contract instead of carrying a hidden compatibility shim in the native path.

# Harness Adapter Boundary

## Context

Harness session discovery, prompt parsing, completion parsing, launch arguments, and default labels were previously spread across terminal lifecycle and title-generation modules. That made each new harness provider a cross-cutting change.

## Learning

1. Harness-specific behavior should live behind one adapter contract in the desktop backend.
   - The adapter should own CLI launch metadata, session-store lookup, prompt-submission parsing, completion parsing, and provider display metadata.
   - Terminal lifecycle code should consume normalized harness facts instead of branching on provider names.
2. Title generation should not know provider log schemas.
   - Auto-title scheduling should accept normalized prompt text and remain agnostic to whether that prompt came from Claude, Codex, or a future harness.
3. Default terminal labels are part of the same provider contract.
   - A provider display name belongs in the adapter so adding a harness does not require separate label-specific conditionals.

## Milestone Impact

1. M3 harness terminal flows now have an additive provider boundary that is ready for `opencode` and `amp`.
2. Future harness integrations can stay scoped to one adapter module instead of touching terminal watch and title parsing paths.

## Follow-Up Actions

1. Add `opencode` by implementing a single adapter entry once its session log and resume contract are confirmed.
2. Do the same for `amp`, or explicitly document missing primitives if its CLI does not expose a reliable session/event stream.

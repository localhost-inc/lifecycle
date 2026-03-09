# Codex Prompt Submission Contract

## Context

Codex session logs contain multiple user-shaped records. In current logs, the real submitted prompt arrives as `event_msg` with `payload.type == "user_message"`, while `response_item` user messages can contain AGENTS/context scaffolding that should not drive product behavior like auto titling.

## Learning

1. Codex auto-title triggers should treat `event_msg.user_message` as the prompt-submission source of truth.
   - That record matches the actual user submit boundary in current Codex session logs.
   - Using it avoids titling from injected AGENTS/context bundles that appear earlier in the log.
2. Provider adapters should distinguish synthetic transcript records from user intent signals.
   - Not every user-role log entry represents a prompt the user consciously submitted.
   - Product behaviors that depend on "first prompt" need the harness-specific submit event, not a generic user-message fallback.
3. Legacy transcript shapes can still be supported separately when needed.
   - Older Codex logs may include top-level `message` records for real prompts.
   - That compatibility should stay explicit and secondary to the current submit-event contract.

## Milestone Impact

1. M3 harness auto-titles now reflect the actual first Codex prompt instead of the AGENTS/context preamble.
2. The adapter boundary is clearer for upcoming `opencode` and `amp` integrations: each harness needs an explicit prompt-submission contract.

## Follow-Up Actions

1. When adding `opencode` and `amp`, document which log/event shape is the authoritative prompt-submission signal before wiring auto-title behavior.
2. If Codex changes its session log format, update the adapter tests with a captured real log shape before changing parser behavior.

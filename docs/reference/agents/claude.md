# Claude Provider Contract

Canonical contract for Lifecycle's Anthropic provider integration.

Last verified on 2026-03-23 against Anthropic's official Agent SDK TypeScript v2 preview docs and the published `@anthropic-ai/claude-agent-sdk` TypeScript surface installed in this repo.

## Upstream Authority

Use these in order:

1. Anthropic's official TypeScript v2 preview docs for product semantics and supported workflows.
2. The published `@anthropic-ai/claude-agent-sdk` TypeScript surface for concrete exported names when the docs lag.
3. Lifecycle reference docs for how those provider facts map into `agent_session`, `agent_event`, `agent_message`, and `agent_message_part`.

Claude's TypeScript v2 API is still preview / unstable. Treat exact exported names as mutable even when the higher-level session and permission concepts remain stable.

## Session Identity

Claude is session-based.

Rules:

1. Lifecycle `agent_session.provider` is `claude`.
2. Lifecycle `agent_session.provider_session_id` maps to the real Claude `session_id`.
3. Lifecycle must not synthesize a fake provider session ID before Claude emits one.
4. Resume uses the provider-owned session ID, not a terminal ID and not a local UUID.
5. Claude session continuity is directory-scoped. Persist the workspace path / `cwd` alongside the provider session binding.

Relevant upstream surfaces:

1. `unstable_v2_createSession(options)`
2. `unstable_v2_resumeSession(sessionId, options)`
3. `listSessions(options)`
4. `getSessionInfo(sessionId, options)`
5. `getSessionMessages(sessionId, options)`

## Runtime Model

Claude's v2 TypeScript path is a persistent multi-turn session model.

Rules:

1. Lifecycle should treat the provider session as the authoritative continuity boundary for Claude turns.
2. Single-turn convenience helpers are not a replacement for multi-turn session storage.
3. Provider-local session logs are useful for reconciliation, but Lifecycle's durable query model remains `agent_event` plus normalized projections.
4. Terminal output is never a transcript or approval source of truth.

## Permission Model

Claude exposes a real host-controlled permission surface.

Relevant upstream concepts:

1. `permissionMode`
2. `canUseTool`
3. `PermissionResult`
4. `PermissionUpdate`

Observed permission modes in the published TypeScript surface:

1. `default`
2. `acceptEdits`
3. `bypassPermissions`
4. `plan`
5. `dontAsk`

Rules:

1. Lifecycle should drive tool approval through `canUseTool`, not by scraping model text.
2. `PermissionResult.behavior = "allow"` may include `updatedInput` and `updatedPermissions`; Lifecycle should preserve both.
3. `PermissionResult.behavior = "deny"` may include a user-facing message and `interrupt`.
4. Permission updates may target `userSettings`, `projectSettings`, `localSettings`, `session`, or `cliArg`; Lifecycle must distinguish one-turn approval from persisted approval scope.
5. `bypassPermissions` is materially different from `acceptEdits`; do not collapse them into a generic "auto approve" setting.

## User Input / Elicitation

Claude exposes a second host loop for structured user input.

Relevant upstream concepts:

1. `onElicitation`
2. `ElicitationRequest`
3. `ElicitationResult`

Rules:

1. Lifecycle should map MCP / agent questions into first-class approval or question state, not terminal prompts.
2. The request payload should preserve `serverName`, `message`, `mode`, `url`, `elicitationId`, and requested schema data when present.
3. User responses must be routed back through the Claude session callback path, not by injecting synthetic chat text.

## Configuration Surface

Claude options are session-scoped.

Important provider-facing options currently exposed in the published TypeScript surface include:

1. `model`
2. `cwd`
3. `permissionMode`
4. `canUseTool`
5. `onElicitation`
6. `additionalDirectories`
7. `allowedTools`
8. `disallowedTools`
9. `tools`
10. `agents`
11. `continue`

Rules:

1. Provider config shown in Lifecycle UI should map to real Claude session options instead of generic agent settings.
2. Permission and model settings should be persisted per Lifecycle `agent_session` when they define session behavior.
3. Additional directory access is part of the provider contract and should not be silently widened.

## Lifecycle Mapping

Claude facts should land in Lifecycle as follows:

1. Provider session lifecycle -> `agent_session`
2. Raw provider stream / callbacks -> `agent_event`
3. Renderable assistant and user transcript -> `agent_message` and `agent_message_part`
4. Tool gates and elicitation requests -> `agent_approval`
5. Tool outputs and generated files -> `agent_artifact` when Lifecycle chooses to materialize them

Rules:

1. Preserve provider-native IDs and typed payloads in raw events.
2. Do not narrow Claude permission or elicitation payloads into lossy string-only records.
3. Reprojection must be possible if Anthropic expands the preview event surface.

## Sources

1. Anthropic Agent SDK TypeScript v2 preview: https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview
2. Anthropic Agent SDK sessions: https://platform.claude.com/docs/en/agent-sdk/sessions
3. Anthropic Agent SDK agent loop: https://platform.claude.com/docs/en/agent-sdk/agent-loop

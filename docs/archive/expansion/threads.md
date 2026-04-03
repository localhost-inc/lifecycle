# Threads & Messages — Expansion Spec

> Deferred from wedge spec. Target: Phase 4.

## Overview

Threads provide conversation continuity for prompts, clarifications, approvals, and execution flow across Slack, Linear, and CLI channels.

## Entities

### `thread` (user-facing conversation thread)

1. Purpose:
   - continuity boundary for prompts, clarifications, approvals, and execution flow
2. Required fields:
   - `thread_id` (UUID)
   - `organization_id`
   - `repository_id`
   - `workspace_id`
   - `source` (`slack|linear|cli`)
   - `status` (`open|running|waiting-user|blocked|closed|failed`)
   - `requested_by`
   - `created_at`, `updated_at`
3. Invariants:
   - source thread/issue maps to one open thread by default unless explicitly forked
   - thread can outlive any individual agent process

### `message` (turn/event log)

1. Purpose:
   - ordered log of prompts, agent responses, and system notices for a thread
2. Required fields:
   - `message_id` (UUID)
   - `thread_id`
   - `sequence` (monotonic per thread)
   - `role` (`requester|agent|system`)
   - `content`
   - `created_at`
3. Invariants:
   - strict append-only ordering per thread
   - no in-place edits after persisted append

## Key Indexes

- `thread`: index (`organization_id`, `repository_id`, `source`, `source_thread_id|source_issue_id`, `status`)
- `message`: unique (`thread_id`, `sequence`)

## API Endpoints

- `POST /v1/threads`
- `GET /v1/threads/{threadId}`
- `PATCH /v1/threads/{threadId}`
- `POST /v1/threads/{threadId}/messages`

## CLI Commands

- `lifecycle thread start --source slack|linear|cli --repository <repository-id> --message "<text>" [--ref <branch-or-ticket>]`
- `lifecycle thread message --thread <thread-id> --message "<text>"`
- `lifecycle thread status [thread-id]`

## Event Ingress

### Slack

- command invocation and thread start
- follow-up prompt submission on existing thread
- status/preview/test updates

### Linear

- issue-driven thread start and workspace creation
- follow-up prompts via issue comments
- status/preview/test updates

### Ingress-to-Harness Mapping

1. Ingress event is normalized into a `thread` command (`start|message|close`).
2. Lifecycle resolves or creates the target workspace for that thread.
3. Prompt events enqueue an agent turn against a selected `agent_session` in that workspace.
4. Agent turn outputs are normalized into artifacts: preview URL, diff summary, and test results.
5. Artifacts are posted back to the originating Slack thread or Linear issue.
6. Loop continues until thread is closed.

## RBAC

- `requester` role: open/update threads from Slack/Linear/CLI

## User Journeys

### Issue-Driven Workspace from Slack or Linear

1. Trigger: operator invokes command from Slack/Linear for ticket-based workspace
2. Expected flow: ingress validates signature, maps identity, creates workspace tied to ticket ref, status updates posted back
3. Failure handling: duplicate events deduplicated, permission failures return role-specific guidance

### Business/User Prompt Loop

1. Trigger: business user opens Slack thread or Linear ticket with a change request
2. Expected flow: ingress creates/reuses thread, agent applies change, preview URL/diff/test status posted back, user submits follow-ups
3. Failure handling: ambiguous prompts request clarification, expired workspace triggers wake guidance

## Async Job Types

- `thread.turn`

## Acceptance Criteria

1. Slack or Linear thread can iterate through multiple prompts and produce actionable artifacts without terminal access.
2. Thread/issue continuity maps to one durable `thread` unless explicitly forked.
3. Prompt-to-artifact loop (preview/diff/tests) completes without requiring terminal access.

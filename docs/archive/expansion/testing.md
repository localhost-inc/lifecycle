# Workspace Test Jobs — Expansion Spec

> Deferred from wedge spec. Target: Phase 3.

## Overview

Test orchestration, log streaming, suite adapters, and artifact persistence are modeled as workspace jobs (`job_type=test.run`) instead of a separate `test-executions` resource.

## Workspace State Extension

When test jobs are enabled, the workspace state machine gains a `running-tests` state:

- `ready -> running-tests` on `test.run` job start
- `running-tests -> ready|failed` on `test.run` job completion
- `test.run` cannot start unless workspace state is `ready`
- max 1 active `test.run` job per workspace

## Test Job Result Model

1. Job envelope fields:
   - `job_id`, `workspace_id`, `job_type` (`test.run`), `status`, `started_at`, `finished_at`, `duration_ms`
2. Test payload fields:
   - `suite`
3. Summary fields:
   - `total`, `passed`, `failed`, `skipped`, `flake_count`
4. Artifact classes:
   - full raw logs
   - structured failure summary
   - screenshots/videos for UI/e2e suites when produced by the test toolchain
5. Retention:
   - test job summaries retained 30 days (V1 default)
   - full log/artifact retention 14 days (V1 default)

## API Endpoints

- `POST /v1/workspaces/{workspaceId}/jobs` with body `{ "job_type": "test.run", "suite": "smoke|integration|e2e" }` — enqueue test run
- `GET /v1/workspaces/{workspaceId}/jobs/{jobId}` — get status and test summary payload
- `GET /v1/workspaces/{workspaceId}/jobs/{jobId}/events` — stream logs/events (SSE)

## CLI Commands

- `lifecycle workspace test --suite smoke|integration|e2e`

## Async Job Types

- `test.run`

## SLOs

- max runtime per `test.run` job: template-defined, capped at 60 minutes by policy

## Acceptance Criteria

1. A standard smoke suite can be run from web workspace console in under 2 key actions.
2. Test job logs stream in real-time via SSE.
3. Structured failure summaries are persisted and accessible after test completion.

# Pull Request Creation — Expansion Spec

> Deferred from wedge spec. Target: Phase 3.

## Overview

PR creation from workspace branches using GitHub App permissions. The control plane creates PRs on behalf of users — no `gh` CLI required in sandbox.

## API Endpoints

- `POST /v1/workspaces/{workspaceId}/pull-requests`

### Key Payload

- `title`, `body`, `base_branch`, `head_branch`, `draft`
- Returns: `pr_url`, `pr_number`

## CLI Commands

- `lifecycle pr create [--fill]`

## GitHub Integration

1. Pull request creation is performed by control plane via GitHub App permissions, not by sandbox user tokens.
2. `lifecycle pr create` always targets control plane API; `gh` CLI is optional and not required.
3. PR actions are audit logged.

## Acceptance Criteria

1. `lifecycle pr create` opens a pull request from workspace branch without requiring `gh` CLI in sandbox.
2. PR metadata (title, body, draft status) is configurable from CLI.

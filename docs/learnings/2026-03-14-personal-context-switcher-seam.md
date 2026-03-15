# Personal Context Belongs Ahead of Projects in the Shell Strip

Date: 2026-03-14

## Context

The project shell already moved project switching into the titlebar strip so the project layout could stay project-scoped.

As organization-aware flows came into view, the next question was whether the shell should stay purely project-first until M6 or start exposing a first-class context boundary sooner.

The product direction is now clear:

1. users should eventually have both a personal context and shared organization contexts
2. projects belong inside one of those contexts
3. the project sidebar should remain project-scoped instead of becoming a mixed org/project/workspace tree

## Decision

The shell strip should read left-to-right as:

1. active personal/shared context
2. projects inside that context

The first implementation seam is a leading `Personal` control in the existing project switcher strip.

This does not mean local-first now requires auth. It means unsigned local mode and signed-in personal mode can converge on the same shell hierarchy without a later navigation rewrite.

Projects with `organization_id = null` should map into that implicit `Personal` context until sign-in can persist a real personal organization shell.

## Why It Matters

1. `Personal` becomes a durable scope instead of a temporary logged-out special case.
2. Shared orgs can land later in the same strip without moving project navigation again.
3. The project sidebar keeps clear ownership over project pages and workspace launchers.
4. The shell no longer implies that auth identity and navigation scope are the same thing.

## Milestone Impact

1. The current project-shell implementation can expose the `Personal` context seam before M6 org data exists.
2. M6 can replace the single leading `Personal` control with a real context switcher without reworking the project sidebar or page-tab ownership.

## Follow-Up

1. Keep `Personal` as the visible label for the default context instead of a user name.
2. Do not force local project import or workspace creation through sign-in just because the shell now has a personal-context seam.
3. When shared orgs arrive, keep org-level memory/activity/settings separate from project-scoped plans/specs/memory/workspaces.

# Resizable Shell Rails - 2026-03-07

## Context

The desktop shell used fixed widths for the project rail and workspace rail, and the workspace rail split its Git and environment panels with an inflexible 50/50 stack.

That made the shell feel cramped on smaller windows and wasted space on larger ones, especially once terminal and git surfaces started competing for room in M3 and M4 work.

## Learning

The durable resizing contract is:

1. `DashboardLayout` owns outer shell rail widths because it is the only layer that can balance left rail, center surface, and right rail together.
2. `WorkspaceSidebar` owns only its internal vertical split because panel sizing inside the rail should stay local to the rail.
3. Resize state is persisted as best-effort local UI state so the shell reopens with the same working geometry.
4. Width and split calculations should be handled in pure helpers so drag math can be regression-tested without DOM-heavy component tests.
5. The shell should reserve a minimum center workspace surface before allowing either sidebar to expand further.

## Milestone Impact

1. M3: terminal and harness surfaces keep a protected center workspace area while side rails remain adjustable.
2. M4: local lifecycle and observability controls can grow in the right rail without forcing another shell layout rewrite.
3. M5: future CLI/context surfaces can reuse the same persisted shell resizing contract instead of introducing ad-hoc panel math.

## Follow-Up Actions

1. Add a reset-to-default layout action once more shell personalization controls exist.
2. Reuse the same resize-handle treatment in settings or future multi-rail views instead of reimplementing pointer logic.
3. Revisit the right-rail default split once logs land in `EnvironmentPanel` and we have real usage feedback.

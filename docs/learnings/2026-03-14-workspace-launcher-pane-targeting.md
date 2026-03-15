# Workspace Launcher Pane Targeting

Date: 2026-03-14

## Context

Workspace pane launchers create terminals asynchronously, while the canvas controller also has a background path that assigns newly discovered runtime tabs into the current active pane. That creates a race when a launcher is clicked in one pane but runtime events arrive while another pane is still active.

## Learning

1. Pane-local launcher actions must establish pane intent immediately instead of relying on later async tab attachment.
2. Background runtime-tab reconciliation should only be a fallback for unassigned tabs, not the final authority when the user explicitly requested a destination pane.
3. When an explicit runtime-tab show request includes a `paneId`, that requested pane must win even if a background path attached the tab elsewhere first.

## Why It Matters

1. Clicking a launcher in one pane should never open the session in a different pane group.
2. Pane focus and terminal placement need to stay aligned, especially for harness launches that can resolve after other pane interactions.
3. This keeps the workspace surface predictable under async terminal creation and runtime event delivery.

## Milestone Impact

1. M3 canvas pane behavior stays trustworthy because pane-local launchers now preserve the clicked pane as the destination.
2. Follow-on terminal and pane work can keep using background runtime reconciliation without letting it override explicit user placement.

## Follow-Up

1. Treat explicit pane-targeted actions as higher priority than active-pane fallbacks in other async canvas flows.
2. Add regression coverage whenever background reconciliation can race with pane-local user intent.

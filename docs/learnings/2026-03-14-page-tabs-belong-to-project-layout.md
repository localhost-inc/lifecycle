# Page Tabs Belong to the Project Layout

Date: 2026-03-14

## Context

The first project-shell pass put the top-level tabs on the outer shell plane while those tabs actually controlled the full right-hand project main of the project layout.

That made the UI feel ambiguous: the tabs appeared to float in shell chrome while the thing they switched lived lower in a separate layer.

## Decision

The project layout now owns the full project main below the shell switcher strip.

The layering is:

1. shell plane
   - project switcher strip only
2. project layout
   - project sidebar
   - project main
     - page tabs rail
     - active body
   - project footer

The page tabs rail uses `--surface` inside the right-hand project main. The active body uses `--surface`.

## Why It Matters

1. Controls now sit over the surface they actually control.
2. The project shell reads more like a browser/editor main region and less like disconnected shell chrome.
3. The project sidebar clearly belongs to the selected page tab instead of competing with outer-shell navigation.
4. This makes the distinction between project-level page tabs and workspace-internal pane mechanics much easier to explain.

## Milestone Impact

1. The project-shell cutover now treats the shell plane as switcher-only chrome.
2. The project layout is the authority for page-tab layout decisions.
3. The workspace-canvas cutover remains separate; this change only sharpens the project-shell model around it.

## Follow-Up

1. Keep page-tab terminology aligned in docs and code review.
2. Avoid reintroducing top-level tabs into the outer shell plane.
3. Continue making project-tab visuals feel like real browser/editor tabs instead of pills.

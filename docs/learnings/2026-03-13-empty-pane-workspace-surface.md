# Empty Pane State Replaces Launcher Tabs

## Context

The workspace surface originally treated an empty pane as invalid and backfilled it with a synthetic launcher document. That leaked launcher-specific behavior into reducer fallbacks, split-pane creation, drag/drop, persistence, and close flows.

## Learning

An empty pane is a legitimate steady state and should be modeled directly instead of through a fake tab. Once the launcher document was removed:

1. Pane splits could create empty leaves without inventing client-owned tabs.
2. Moving or closing the final tab in a pane could leave that pane empty without needing reducer-only placeholder cleanup.
3. Persistence had to preserve non-default split layouts even when every pane was empty, otherwise the layout silently collapsed on restart.
4. Legacy persisted launcher documents must be dropped on read so old snapshots do not keep stale `launcher:*` tab keys alive forever.

## Milestone Impact

- M3: the shared workspace surface now enters through an empty pane state with direct shell/harness launch actions instead of a launcher tab, while split panes and local restore stay consistent.

## Follow-Up

1. If workspace activity or session history should return to the empty state, add them as pane-level sections instead of reintroducing a synthetic launcher document kind.
2. If more keyboard shortcuts are added for pane creation or launch flows, bind them to concrete actions (for example shell launch) rather than placeholder tabs.

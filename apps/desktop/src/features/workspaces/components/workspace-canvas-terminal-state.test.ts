import { describe, expect, test } from "bun:test";
import { terminalTabKey } from "@/features/workspaces/state/workspace-canvas-state";
import {
  getWorkspaceInactiveTerminalIds,
  getWorkspaceLiveTerminalTabKeys,
  getWorkspacePaneIdsWaitingForSelectedTerminalTab,
  getWorkspaceRenderedPaneActiveTabKeys,
  getWorkspaceSuppressedSleepingTerminalTabKeys,
  getWorkspaceUnassignedLiveTerminalTabKeys,
} from "@/features/workspaces/components/workspace-canvas-terminal-state";

describe("canvas terminal tab helpers", () => {
  test("only auto-attaches live terminal tabs that are not already assigned or hidden", () => {
    expect(
      getWorkspaceUnassignedLiveTerminalTabKeys(
        getWorkspaceLiveTerminalTabKeys([
          { key: terminalTabKey("term-1") },
          { key: terminalTabKey("term-2") },
          { key: terminalTabKey("term-3") },
        ]),
        new Set([terminalTabKey("term-1")]),
        [terminalTabKey("term-3")],
      ),
    ).toEqual([terminalTabKey("term-2")]);
  });

  test("suppresses sleeping terminal tabs until the user explicitly restores them", () => {
    expect(
      getWorkspaceSuppressedSleepingTerminalTabKeys(
        [
          { key: terminalTabKey("term-active"), status: "active" },
          { key: terminalTabKey("term-sleeping"), status: "sleeping" },
          { key: terminalTabKey("term-restored"), status: "sleeping" },
        ],
        new Set([terminalTabKey("term-restored")]),
      ),
    ).toEqual([terminalTabKey("term-sleeping")]);
  });

  test("marks panes as waiting only for live terminal tabs that have not rendered yet", () => {
    expect(
      getWorkspacePaneIdsWaitingForSelectedTerminalTab(
        [
          { activeTabKey: terminalTabKey("term-1"), id: "pane-a" },
          { activeTabKey: "file:README.md", id: "pane-b" },
        ],
        {
          "pane-a": [],
          "pane-b": [{ key: "file:README.md" }],
        },
        new Set([terminalTabKey("term-1")]),
      ),
    ).toEqual(new Set(["pane-a"]));
  });

  test("does not wait on non-live terminal tabs that no longer have a live session", () => {
    expect(
      getWorkspacePaneIdsWaitingForSelectedTerminalTab(
        [{ activeTabKey: terminalTabKey("term-9"), id: "pane-a" }],
        { "pane-a": [] },
        new Set([terminalTabKey("term-1")]),
      ),
    ).toEqual(new Set());
  });

  test("does not mark a pane as waiting when a visible fallback tab is already rendering", () => {
    expect(
      getWorkspacePaneIdsWaitingForSelectedTerminalTab(
        [{ activeTabKey: terminalTabKey("term-1"), id: "pane-a" }],
        { "pane-a": [{ key: "file:README.md" }] },
        new Set([terminalTabKey("term-1")]),
      ),
    ).toEqual(new Set());
  });

  test("resolves each pane's active tab from currently visible tabs", () => {
    expect(
      getWorkspaceRenderedPaneActiveTabKeys(
        [
          { activeTabKey: terminalTabKey("missing"), id: "pane-a" },
          { activeTabKey: "file:README.md", id: "pane-b" },
        ],
        {
          "pane-a": [{ key: terminalTabKey("term-1") }],
          "pane-b": [{ key: "file:README.md" }],
        },
      ),
    ).toEqual({
      "pane-a": terminalTabKey("term-1"),
      "pane-b": "file:README.md",
    });
  });

  test("identifies live terminal surfaces that are no longer rendered in any pane", () => {
    expect(
      getWorkspaceInactiveTerminalIds(
        getWorkspaceLiveTerminalTabKeys([
          { key: terminalTabKey("term-1") },
          { key: terminalTabKey("term-2") },
          { key: terminalTabKey("term-3") },
        ]),
        {
          "pane-a": terminalTabKey("term-1"),
          "pane-b": "file:README.md",
          "pane-c": null,
        },
      ),
    ).toEqual(["term-2", "term-3"]);
  });
});

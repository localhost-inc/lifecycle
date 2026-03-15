import { describe, expect, test } from "bun:test";
import {
  getWorkspaceInactiveRuntimeTerminalIds,
  getWorkspaceLiveRuntimeTabKeys,
  getWorkspacePaneIdsWaitingForSelectedRuntimeTab,
  getWorkspaceRenderedPaneActiveTabKeys,
  getWorkspaceUnassignedLiveRuntimeTabKeys,
} from "./workspace-canvas-runtime-state";

describe("canvas runtime helpers", () => {
  test("only auto-attaches live runtime tabs that are not already assigned or hidden", () => {
    expect(
      getWorkspaceUnassignedLiveRuntimeTabKeys(
        getWorkspaceLiveRuntimeTabKeys([
          { key: "terminal:term-1" },
          { key: "terminal:term-2" },
          { key: "terminal:term-3" },
        ]),
        new Set(["terminal:term-1"]),
        ["terminal:term-3"],
      ),
    ).toEqual(["terminal:term-2"]);
  });

  test("marks panes as waiting only for live runtime tabs that have not rendered yet", () => {
    expect(
      getWorkspacePaneIdsWaitingForSelectedRuntimeTab(
        [
          { activeTabKey: "terminal:term-1", id: "pane-a" },
          { activeTabKey: "file:README.md", id: "pane-b" },
        ],
        {
          "pane-a": [],
          "pane-b": [{ key: "file:README.md" }],
        },
        new Set(["terminal:term-1"]),
      ),
    ).toEqual(new Set(["pane-a"]));
  });

  test("does not wait on non-live runtime tabs that no longer have a live session", () => {
    expect(
      getWorkspacePaneIdsWaitingForSelectedRuntimeTab(
        [{ activeTabKey: "terminal:term-9", id: "pane-a" }],
        { "pane-a": [] },
        new Set(["terminal:term-1"]),
      ),
    ).toEqual(new Set());
  });

  test("does not mark a pane as waiting when a visible fallback tab is already rendering", () => {
    expect(
      getWorkspacePaneIdsWaitingForSelectedRuntimeTab(
        [{ activeTabKey: "terminal:term-1", id: "pane-a" }],
        { "pane-a": [{ key: "file:README.md" }] },
        new Set(["terminal:term-1"]),
      ),
    ).toEqual(new Set());
  });

  test("resolves each pane's active tab from currently visible tabs", () => {
    expect(
      getWorkspaceRenderedPaneActiveTabKeys(
        [
          { activeTabKey: "terminal:missing", id: "pane-a" },
          { activeTabKey: "file:README.md", id: "pane-b" },
        ],
        {
          "pane-a": [{ key: "terminal:term-1" }],
          "pane-b": [{ key: "file:README.md" }],
        },
      ),
    ).toEqual({
      "pane-a": "terminal:term-1",
      "pane-b": "file:README.md",
    });
  });

  test("identifies live terminal surfaces that are no longer rendered in any pane", () => {
    expect(
      getWorkspaceInactiveRuntimeTerminalIds(
        getWorkspaceLiveRuntimeTabKeys([
          { key: "terminal:term-1" },
          { key: "terminal:term-2" },
          { key: "terminal:term-3" },
        ]),
        {
          "pane-a": "terminal:term-1",
          "pane-b": "file:README.md",
          "pane-c": null,
        },
      ),
    ).toEqual(["term-2", "term-3"]);
  });
});

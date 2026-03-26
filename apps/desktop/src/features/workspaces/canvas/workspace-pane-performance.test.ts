import { beforeEach, describe, expect, test } from "bun:test";
import {
  beginWorkspacePaneTabSwitchTrace,
  completeWorkspacePaneTabSwitchStage,
  measureActiveWorkspacePaneComputation,
  readWorkspacePanePerformanceSnapshot,
  resetWorkspacePanePerformance,
  setWorkspacePanePerformanceEnabled,
} from "@/features/workspaces/canvas/workspace-pane-performance";

describe("workspace pane performance", () => {
  beforeEach(() => {
    resetWorkspacePanePerformance();
    setWorkspacePanePerformanceEnabled(true);
  });

  test("records one active tab-switch computation per pending switch", () => {
    beginWorkspacePaneTabSwitchTrace({ paneId: "pane-1", tabKey: "file:README.md" });

    const value = measureActiveWorkspacePaneComputation("controller-derive", () => 42);
    const repeated = measureActiveWorkspacePaneComputation("controller-derive", () => 24);
    const snapshot = readWorkspacePanePerformanceSnapshot();

    expect(value).toBe(42);
    expect(repeated).toBe(24);
    expect(snapshot.measures.filter((entry) => entry.name === "tab-switch:controller-derive")).toHaveLength(1);
    expect(snapshot.measures[0]?.metadata).toEqual({
      paneId: "pane-1",
      tabKey: "file:README.md",
    });
  });

  test("completes pending tab-switch stages only for the matching pane and tab", () => {
    beginWorkspacePaneTabSwitchTrace({ paneId: "pane-2", tabKey: "agent:session-1" });

    expect(
      completeWorkspacePaneTabSwitchStage("dispatch->paint", {
        paneId: "pane-2",
        tabKey: "file:README.md",
      }),
    ).toBeNull();

    expect(
      completeWorkspacePaneTabSwitchStage("dispatch->paint", {
        clearPending: true,
        paneId: "pane-2",
        tabKey: "agent:session-1",
      }),
    ).not.toBeNull();

    const snapshot = readWorkspacePanePerformanceSnapshot();
    expect(snapshot.pendingTabSwitch).toBeNull();
    expect(snapshot.measures.at(-1)?.name).toBe("tab-switch:dispatch->paint");
  });

  test("does not record measures while disabled", () => {
    setWorkspacePanePerformanceEnabled(false);
    beginWorkspacePaneTabSwitchTrace({ paneId: "pane-1", tabKey: "preview:app" });

    const value = measureActiveWorkspacePaneComputation("controller-derive", () => "ok");
    const result = completeWorkspacePaneTabSwitchStage("pane-tree-render", {
      paneId: "pane-1",
      tabKey: "preview:app",
    });

    expect(value).toBe("ok");
    expect(result).toBeNull();
    expect(readWorkspacePanePerformanceSnapshot().measures).toHaveLength(0);
  });
});

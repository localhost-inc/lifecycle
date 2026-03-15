import { describe, expect, test } from "bun:test";
import {
  closeWorkspacePaneLayout,
  createWorkspacePane,
  getWorkspacePane,
  hasWorkspacePane,
  inspectWorkspacePaneLayout,
  splitWorkspacePaneLayout,
  updateWorkspacePaneLayoutSplit,
} from "./workspace-pane-layout";

const NESTED_LAYOUT = {
  direction: "row" as const,
  first: {
    id: "pane-a",
    kind: "leaf" as const,
  },
  id: "split-root",
  kind: "split" as const,
  ratio: 0.4,
  second: {
    direction: "column" as const,
    first: {
      id: "pane-b",
      kind: "leaf" as const,
    },
    id: "split-right",
    kind: "split" as const,
    ratio: 0.55,
    second: {
      id: "pane-c",
      kind: "leaf" as const,
    },
  },
};

describe("workspace pane layout helpers", () => {
  test("inspects pane layouts without exposing raw tree traversal to callers", () => {
    expect(inspectWorkspacePaneLayout(NESTED_LAYOUT)).toEqual({
      firstPane: {
        id: "pane-a",
        kind: "leaf",
      },
      paneCount: 3,
      paneIds: ["pane-a", "pane-b", "pane-c"],
      panes: [
        { id: "pane-a", kind: "leaf" },
        { id: "pane-b", kind: "leaf" },
        { id: "pane-c", kind: "leaf" },
      ],
    });
  });

  test("resolves pane membership through the layout contract", () => {
    expect(hasWorkspacePane(NESTED_LAYOUT, "pane-b")).toBe(true);
    expect(hasWorkspacePane(NESTED_LAYOUT, "pane-missing")).toBe(false);
    expect(getWorkspacePane(NESTED_LAYOUT, "pane-c")).toEqual({
      id: "pane-c",
      kind: "leaf",
    });
  });

  test("splits only known panes and leaves unknown targets unchanged", () => {
    expect(
      splitWorkspacePaneLayout(NESTED_LAYOUT, "pane-missing", {
        direction: "row",
        first: createWorkspacePane("pane-new"),
        id: "split-new",
        kind: "split",
        ratio: 0.5,
        second: {
          id: "pane-missing",
          kind: "leaf",
        },
      }),
    ).toEqual({
      didSplit: false,
      nextRoot: NESTED_LAYOUT,
    });

    expect(
      splitWorkspacePaneLayout(NESTED_LAYOUT, "pane-b", {
        direction: "column",
        first: {
          id: "pane-b",
          kind: "leaf",
        },
        id: "split-new",
        kind: "split",
        ratio: 0.3,
        second: createWorkspacePane("pane-new"),
      }),
    ).toEqual({
      didSplit: true,
      nextRoot: {
        direction: "row",
        first: {
          id: "pane-a",
          kind: "leaf",
        },
        id: "split-root",
        kind: "split",
        ratio: 0.4,
        second: {
          direction: "column",
          first: {
            direction: "column",
            first: {
              id: "pane-b",
              kind: "leaf",
            },
            id: "split-new",
            kind: "split",
            ratio: 0.3,
            second: {
              id: "pane-new",
              kind: "leaf",
            },
          },
          id: "split-right",
          kind: "split",
          ratio: 0.55,
          second: {
            id: "pane-c",
            kind: "leaf",
          },
        },
      },
    });
  });

  test("closes panes through an explicit result contract", () => {
    expect(closeWorkspacePaneLayout(createWorkspacePane(), "pane-root")).toEqual({
      didClose: false,
      nextRoot: createWorkspacePane(),
      survivingPaneId: null,
    });

    expect(closeWorkspacePaneLayout(NESTED_LAYOUT, "pane-b")).toEqual({
      didClose: true,
      nextRoot: {
        direction: "row",
        first: {
          id: "pane-a",
          kind: "leaf",
        },
        id: "split-root",
        kind: "split",
        ratio: 0.4,
        second: {
          id: "pane-c",
          kind: "leaf",
        },
      },
      survivingPaneId: "pane-c",
    });
  });

  test("updates only the targeted split node", () => {
    expect(
      updateWorkspacePaneLayoutSplit(NESTED_LAYOUT, "split-missing", (split) => ({
        ...split,
        ratio: 0.2,
      })),
    ).toEqual({
      didUpdate: false,
      nextRoot: NESTED_LAYOUT,
    });

    expect(
      updateWorkspacePaneLayoutSplit(NESTED_LAYOUT, "split-right", (split) => ({
        ...split,
        ratio: 0.8,
      })),
    ).toEqual({
      didUpdate: true,
      nextRoot: {
        direction: "row",
        first: {
          id: "pane-a",
          kind: "leaf",
        },
        id: "split-root",
        kind: "split",
        ratio: 0.4,
        second: {
          direction: "column",
          first: {
            id: "pane-b",
            kind: "leaf",
          },
          id: "split-right",
          kind: "split",
          ratio: 0.8,
          second: {
            id: "pane-c",
            kind: "leaf",
          },
        },
      },
    });
  });
});

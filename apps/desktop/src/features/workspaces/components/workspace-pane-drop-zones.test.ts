import { describe, expect, test } from "bun:test";
import {
  resolveWorkspacePaneDropIntent,
  resolveWorkspacePaneDropIntentFromGeometry,
  resolveWorkspacePaneDropStateFromGeometry,
  resolveWorkspacePaneTabStripDropTarget,
} from "@/features/workspaces/components/workspace-pane-drop-zones";

const PANE_RECT = {
  bottom: 600,
  height: 500,
  left: 100,
  right: 900,
  top: 100,
  width: 800,
};

const TAB_RECTS = [
  {
    key: "terminal:one",
    left: 180,
    width: 140,
  },
  {
    key: "file:README.md",
    left: 330,
    width: 150,
  },
  {
    key: "diff:changes",
    left: 490,
    width: 150,
  },
];

describe("resolveWorkspacePaneTabStripDropTarget", () => {
  test("places a drag before the hovered tab midpoint", () => {
    expect(
      resolveWorkspacePaneTabStripDropTarget({
        draggedKey: "terminal:one",
        pointerX: 360,
        tabRects: TAB_RECTS,
      }),
    ).toEqual({
      placement: "before",
      targetKey: "file:README.md",
    });
  });

  test("places a drag after the trailing tab when released in strip whitespace", () => {
    expect(
      resolveWorkspacePaneTabStripDropTarget({
        draggedKey: "terminal:one",
        pointerX: 880,
        tabRects: TAB_RECTS,
      }),
    ).toEqual({
      placement: "after",
      targetKey: "diff:changes",
    });
  });
});

describe("resolveWorkspacePaneDropIntent", () => {
  test("keeps same-pane tab-bar drags in reorder mode", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: true,
        pointerX: 360,
        pointerY: 118,
        tabRects: TAB_RECTS,
      }),
    ).toEqual({
      kind: "reorder",
      paneId: "pane-root",
      placement: "before",
      targetKey: "file:README.md",
    });
  });

  test("allows same-pane bottom-edge drags to create a pane below", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: false,
        pointerX: 420,
        pointerY: 592,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-root",
      splitDirection: "column",
      splitPlacement: "after",
      splitRatio: 0.52,
    });
  });

  test("does not split the same pane when the pointer is in the body center", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: false,
        pointerX: 500,
        pointerY: 470,
      }),
    ).toBeNull();
  });

  test("treats the left half of the same pane body as a split-left target", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: false,
        pointerX: 220,
        pointerY: 340,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-root",
      splitDirection: "row",
      splitPlacement: "before",
      splitRatio: 0.42,
    });
  });

  test("treats the top edge of the same pane body as a split-above target", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: false,
        pointerX: 500,
        pointerY: 126,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-root",
      splitDirection: "column",
      splitPlacement: "before",
      splitRatio: 0.48,
    });
  });

  test("positions drops before a hovered tab in another pane", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-2",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: true,
        pointerX: 238,
        pointerY: 122,
        tabRects: [
          {
            key: "changes:workspace",
            left: 220,
            width: 160,
          },
        ],
      }),
    ).toEqual({
      kind: "insert",
      paneId: "pane-2",
      placement: "before",
      surface: "tab-bar",
      targetKey: "changes:workspace",
    });
  });

  test("treats the center of another pane body as a move into that pane", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-2",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: false,
        pointerX: 500,
        pointerY: 350,
      }),
    ).toEqual({
      kind: "insert",
      paneId: "pane-2",
      placement: null,
      surface: "body",
      targetKey: null,
    });
  });

  test("treats the top edge of another pane body as a split-above target", () => {
    expect(
      resolveWorkspacePaneDropIntent({
        bodyRect: PANE_RECT,
        candidatePaneId: "pane-2",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        pointerOverTabBar: false,
        pointerX: 500,
        pointerY: 126,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-2",
      splitDirection: "column",
      splitPlacement: "before",
      splitRatio: 0.48,
    });
  });

  test("resolves drop intent from measured pane geometry instead of the live DOM hit target", () => {
    expect(
      resolveWorkspacePaneDropIntentFromGeometry({
        draggedKey: "terminal:one",
        paneGeometries: [
          {
            paneId: "pane-root",
            paneRect: PANE_RECT,
          },
          {
            paneId: "pane-2",
            paneRect: {
              bottom: 600,
              height: 500,
              left: 920,
              right: 1320,
              top: 100,
              width: 400,
            },
            tabBarRect: {
              bottom: 140,
              height: 40,
              left: 920,
              right: 1320,
              top: 100,
              width: 400,
            },
            tabRects: [
              {
                key: "file:README.md",
                left: 960,
                width: 150,
              },
            ],
          },
        ],
        paneId: "pane-root",
        pointerX: 980,
        pointerY: 120,
      }),
    ).toEqual({
      kind: "insert",
      paneId: "pane-2",
      placement: "before",
      surface: "tab-bar",
      targetKey: "file:README.md",
    });
  });

  test("does not treat pane header controls as body drop space", () => {
    expect(
      resolveWorkspacePaneDropStateFromGeometry({
        draggedKey: "terminal:one",
        paneGeometries: [
          {
            bodyRect: {
              bottom: 600,
              height: 460,
              left: 100,
              right: 900,
              top: 140,
              width: 800,
            },
            paneId: "pane-root",
            paneRect: PANE_RECT,
            tabBarRect: {
              bottom: 140,
              height: 40,
              left: 100,
              right: 560,
              top: 100,
              width: 460,
            },
          },
        ],
        paneId: "pane-root",
        pointerX: 760,
        pointerY: 120,
      }),
    ).toEqual({
      hoveredPaneId: null,
      intent: null,
    });
  });

  test("keeps the hovered pane visible for same-pane body center drags without resolving a drop", () => {
    expect(
      resolveWorkspacePaneDropStateFromGeometry({
        draggedKey: "terminal:one",
        paneGeometries: [
          {
            bodyRect: {
              bottom: 600,
              height: 460,
              left: 100,
              right: 900,
              top: 140,
              width: 800,
            },
            paneId: "pane-root",
            paneRect: PANE_RECT,
          },
        ],
        paneId: "pane-root",
        pointerX: 500,
        pointerY: 360,
      }),
    ).toEqual({
      hoveredPaneId: "pane-root",
      intent: null,
    });
  });

  test("uses the pane body rather than the full shell when resolving top-edge splits", () => {
    const paneGeometries = [
      {
        bodyRect: {
          bottom: 600,
          height: 460,
          left: 100,
          right: 900,
          top: 140,
          width: 800,
        },
        paneId: "pane-root",
        paneRect: PANE_RECT,
      },
    ];

    expect(
      resolveWorkspacePaneDropStateFromGeometry({
        draggedKey: "terminal:one",
        paneGeometries,
        paneId: "pane-root",
        pointerX: 500,
        pointerY: 126,
      }),
    ).toEqual({
      hoveredPaneId: null,
      intent: null,
    });

    expect(
      resolveWorkspacePaneDropIntentFromGeometry({
        draggedKey: "terminal:one",
        paneGeometries,
        paneId: "pane-root",
        pointerX: 500,
        pointerY: 146,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-root",
      splitDirection: "column",
      splitPlacement: "before",
      splitRatio: 0.5,
    });
  });
});

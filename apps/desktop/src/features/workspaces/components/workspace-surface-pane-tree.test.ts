import { afterEach, describe, expect, test } from "bun:test";
import {
  resolveWorkspaceSurfacePaneDropIntent,
  resolveWorkspaceSurfaceTabStripDropTarget,
  shouldAutoSelectWorkspacePaneFromPointerTarget,
} from "./workspace-surface-pane-tree";

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

const originalElement = globalThis.Element;

afterEach(() => {
  if (originalElement === undefined) {
    delete (globalThis as { Element?: typeof Element }).Element;
    return;
  }

  (globalThis as { Element: typeof Element }).Element = originalElement;
});

describe("resolveWorkspaceSurfaceTabStripDropTarget", () => {
  test("places a drag before the hovered tab midpoint", () => {
    expect(
      resolveWorkspaceSurfaceTabStripDropTarget({
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
      resolveWorkspaceSurfaceTabStripDropTarget({
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

describe("resolveWorkspaceSurfacePaneDropIntent", () => {
  test("keeps same-pane tab-bar drags in reorder mode", () => {
    expect(
      resolveWorkspaceSurfacePaneDropIntent({
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        paneRect: PANE_RECT,
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
      resolveWorkspaceSurfacePaneDropIntent({
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        paneRect: PANE_RECT,
        pointerOverTabBar: false,
        pointerX: 420,
        pointerY: 592,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-root",
      splitDirection: "column",
      splitPlacement: "after",
    });
  });

  test("treats the lower half of the same pane body as a split-below target", () => {
    expect(
      resolveWorkspaceSurfacePaneDropIntent({
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        paneRect: PANE_RECT,
        pointerOverTabBar: false,
        pointerX: 500,
        pointerY: 470,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-root",
      splitDirection: "column",
      splitPlacement: "after",
    });
  });

  test("treats the left half of the same pane body as a split-left target", () => {
    expect(
      resolveWorkspaceSurfacePaneDropIntent({
        candidatePaneId: "pane-root",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        paneRect: PANE_RECT,
        pointerOverTabBar: false,
        pointerX: 220,
        pointerY: 340,
      }),
    ).toEqual({
      kind: "split",
      paneId: "pane-root",
      splitDirection: "row",
      splitPlacement: "before",
    });
  });

  test("positions drops before a hovered tab in another pane", () => {
    expect(
      resolveWorkspaceSurfacePaneDropIntent({
        candidatePaneId: "pane-2",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        paneRect: PANE_RECT,
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
      resolveWorkspaceSurfacePaneDropIntent({
        candidatePaneId: "pane-2",
        draggedKey: "terminal:one",
        paneId: "pane-root",
        paneRect: PANE_RECT,
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
});

describe("shouldAutoSelectWorkspacePaneFromPointerTarget", () => {
  test("does not auto-select a pane when the pointer starts on an interactive control", () => {
    class FakeElement {
      closest(selector: string) {
        return selector.includes("[data-tab-action]") ? this : null;
      }
    }

    (globalThis as { Element?: typeof Element }).Element = FakeElement as unknown as typeof Element;

    expect(
      shouldAutoSelectWorkspacePaneFromPointerTarget(
        new FakeElement() as unknown as EventTarget,
      ),
    ).toBe(false);
  });

  test("auto-selects a pane for null or non-control targets", () => {
    class FakeElement {
      closest() {
        return null;
      }
    }

    (globalThis as { Element?: typeof Element }).Element = FakeElement as unknown as typeof Element;

    expect(
      shouldAutoSelectWorkspacePaneFromPointerTarget(
        new FakeElement() as unknown as EventTarget,
      ),
    ).toBe(true);
    expect(shouldAutoSelectWorkspacePaneFromPointerTarget(null)).toBe(true);
  });
});

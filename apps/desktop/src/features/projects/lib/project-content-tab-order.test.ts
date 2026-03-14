import { describe, expect, test } from "bun:test";
import {
  getProjectContentTabDragShiftDirection,
  reorderProjectContentTabIds,
  resolveProjectContentTabStripDropTarget,
} from "./project-content-tab-order";

describe("project content tab order", () => {
  test("reorders tabs after the hovered tab", () => {
    expect(
      reorderProjectContentTabIds(
        ["view:overview", "workspace:1", "pull-request:42"],
        "workspace:1",
        "pull-request:42",
        "after",
      ),
    ).toEqual(["view:overview", "pull-request:42", "workspace:1"]);
  });

  test("shifts intervening tabs left when previewing a drag to the right", () => {
    expect(
      getProjectContentTabDragShiftDirection(
        ["view:overview", "workspace:1", "pull-request:42"],
        "view:overview",
        "pull-request:42",
        "after",
        "workspace:1",
      ),
    ).toBe(-1);
  });

  test("shifts intervening tabs right when previewing a drag to the left", () => {
    expect(
      getProjectContentTabDragShiftDirection(
        ["view:overview", "workspace:1", "pull-request:42"],
        "pull-request:42",
        "view:overview",
        "before",
        "workspace:1",
      ),
    ).toBe(1);
  });

  test("resolves strip targets by midpoint even when the pointer is between tabs", () => {
    expect(
      resolveProjectContentTabStripDropTarget({
        draggedId: "view:overview",
        pointerX: 145,
        tabRects: [
          { id: "view:overview", left: 0, width: 120 },
          { id: "workspace:1", left: 160, width: 120 },
          { id: "pull-request:42", left: 320, width: 120 },
        ],
      }),
    ).toEqual({
      placement: "before",
      targetId: "workspace:1",
    });
  });
});

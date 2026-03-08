import { describe, expect, test } from "bun:test";
import { getLeftSidebarRailClassName, getLeftSidebarRailWidth } from "./dashboard-layout";

describe("getLeftSidebarRailClassName", () => {
  test("disables width animation during an active left-rail drag", () => {
    expect(getLeftSidebarRailClassName(true)).not.toContain("transition-[width]");
  });

  test("keeps collapse and expand animated when the left rail is idle", () => {
    expect(getLeftSidebarRailClassName(false)).toContain("transition-[width]");
  });
});

describe("getLeftSidebarRailWidth", () => {
  test("collapses the left rail fully off-canvas", () => {
    expect(
      getLeftSidebarRailWidth({
        collapsed: true,
        width: 256,
      }),
    ).toBe("0px");
  });

  test("preserves the remembered expanded width", () => {
    expect(
      getLeftSidebarRailWidth({
        collapsed: false,
        width: 288,
      }),
    ).toBe("288px");
  });
});

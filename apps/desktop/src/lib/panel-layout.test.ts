import { describe, expect, test } from "bun:test";
import type { StorageLike } from "./panel-layout";
import {
  clampPanelSize,
  clampSplitRatio,
  getLeftSidebarWidthFromPointer,
  getRightSidebarWidthFromPointer,
  getSidebarWidthBounds,
  getSplitRatioBounds,
  getVerticalSplitRatioFromPointer,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "./panel-layout";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("panel layout helpers", () => {
  test("keeps sidebar widths inside their computed bounds", () => {
    const bounds = getSidebarWidthBounds({
      containerWidth: 1280,
      maxWidth: 420,
      minWidth: 224,
      oppositeSidebarWidth: 300,
    });

    expect(bounds).toEqual({
      maxSize: 420,
      minSize: 224,
    });
    expect(clampPanelSize(180, bounds)).toBe(224);
    expect(clampPanelSize(512, bounds)).toBe(420);
  });

  test("reduces the draggable max width when the center panel needs room", () => {
    const bounds = getSidebarWidthBounds({
      containerWidth: 980,
      maxWidth: 420,
      minWidth: 260,
      oppositeSidebarWidth: 256,
    });

    expect(bounds).toEqual({
      maxSize: 260,
      minSize: 260,
    });
  });

  test("derives left and right sidebar widths from pointer position", () => {
    const bounds = {
      maxSize: 420,
      minSize: 224,
    };

    expect(getLeftSidebarWidthFromPointer(360, 0, bounds)).toBe(360);
    expect(getLeftSidebarWidthFromPointer(40, 0, bounds)).toBe(224);
    expect(getRightSidebarWidthFromPointer(960, 1280, bounds)).toBe(320);
    expect(getRightSidebarWidthFromPointer(1200, 1280, bounds)).toBe(224);
  });

  test("clamps split ratios when the rail gets too short for two minimum-height panels", () => {
    expect(getSplitRatioBounds(320, 180)).toEqual({
      maxRatio: 0.5,
      minRatio: 0.5,
    });
    expect(clampSplitRatio(0.8, getSplitRatioBounds(640, 180))).toBeCloseTo(0.71875);
  });

  test("derives the top-panel ratio from pointer position", () => {
    expect(getVerticalSplitRatioFromPointer(280, 100, 600, 180)).toBeCloseTo(0.3);
    expect(getVerticalSplitRatioFromPointer(150, 100, 600, 180)).toBeCloseTo(0.3);
    expect(getVerticalSplitRatioFromPointer(650, 100, 600, 180)).toBeCloseTo(0.7);
  });

  test("persists numeric panel values when storage is available", () => {
    const storage = new MemoryStorage();

    expect(readPersistedPanelValue("panel", 256, storage)).toBe(256);

    writePersistedPanelValue("panel", 320, storage);
    expect(readPersistedPanelValue("panel", 256, storage)).toBe(320);

    storage.setItem("panel", "invalid");
    expect(readPersistedPanelValue("panel", 256, storage)).toBe(256);
  });
});

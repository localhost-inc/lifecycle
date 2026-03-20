import { describe, expect, test } from "bun:test";
import { resolveContainedOverlayWidth } from "@/lib/overlay-boundary";

describe("resolveContainedOverlayWidth", () => {
  test("keeps the ideal width when there is no measured boundary", () => {
    expect(resolveContainedOverlayWidth({ boundaryWidth: null, idealWidth: 352 })).toBe(352);
  });

  test("shrinks the overlay to stay inside the boundary gutters", () => {
    expect(
      resolveContainedOverlayWidth({
        boundaryWidth: 320,
        idealWidth: 352,
        inset: 12,
      }),
    ).toBe(296);
  });

  test("falls back to the full boundary width when the inset would overconstrain it", () => {
    expect(
      resolveContainedOverlayWidth({
        boundaryWidth: 20,
        idealWidth: 352,
        inset: 12,
      }),
    ).toBe(20);
  });
});

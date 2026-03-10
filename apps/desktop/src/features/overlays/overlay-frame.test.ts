import { describe, expect, test } from "bun:test";
import { computeHostedOverlayFrame } from "./overlay-frame";

describe("computeHostedOverlayFrame", () => {
  test("keeps the overlay inside horizontal gutters", () => {
    const frame = computeHostedOverlayFrame({
      anchor: { height: 32, left: 620, top: 16, width: 40 },
      placement: {
        align: "end",
        estimatedHeight: 240,
        gutter: 16,
        preferredWidth: 248,
        side: "bottom",
        sideOffset: 8,
      },
      viewport: { height: 600, width: 640 },
    });

    expect(frame.left).toBe(376);
    expect(frame.width).toBe(248);
    expect(frame.side).toBe("bottom");
  });

  test("flips above when there is more room above than below", () => {
    const frame = computeHostedOverlayFrame({
      anchor: { height: 40, left: 240, top: 520, width: 80 },
      placement: {
        align: "center",
        estimatedHeight: 260,
        gutter: 16,
        preferredWidth: 352,
        side: "bottom",
        sideOffset: 8,
      },
      viewport: { height: 640, width: 800 },
    });

    expect(frame.side).toBe("top");
    expect(frame.top).toBeLessThan(520);
    expect(frame.maxHeight).toBeGreaterThan(0);
  });
});

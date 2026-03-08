import { describe, expect, test } from "bun:test";
import {
  resolveNativeTerminalSurfaceInteraction,
  shouldShowNativeTerminalSurface,
} from "./native-terminal-surface";

describe("shouldShowNativeTerminalSurface", () => {
  test("requires an active live session with measurable bounds", () => {
    expect(
      shouldShowNativeTerminalSurface({
        active: true,
        hasLiveSession: true,
        height: 640,
        width: 960,
      }),
    ).toBeTrue();
    expect(
      shouldShowNativeTerminalSurface({
        active: false,
        hasLiveSession: true,
        height: 640,
        width: 960,
      }),
    ).toBeFalse();
    expect(
      shouldShowNativeTerminalSurface({
        active: true,
        hasLiveSession: false,
        height: 640,
        width: 960,
      }),
    ).toBeFalse();
    expect(
      shouldShowNativeTerminalSurface({
        active: true,
        hasLiveSession: true,
        height: 1,
        width: 960,
      }),
    ).toBeFalse();
  });
});

describe("resolveNativeTerminalSurfaceInteraction", () => {
  test("keeps the native surface visible but non-interactive during shell drags", () => {
    expect(
      resolveNativeTerminalSurfaceInteraction({
        shellResizeInProgress: true,
        visible: true,
      }),
    ).toEqual({
      focused: false,
      pointerPassthrough: true,
    });
  });

  test("restores focus when shell dragging is inactive", () => {
    expect(
      resolveNativeTerminalSurfaceInteraction({
        shellResizeInProgress: false,
        visible: true,
      }),
    ).toEqual({
      focused: true,
      pointerPassthrough: false,
    });
  });
});

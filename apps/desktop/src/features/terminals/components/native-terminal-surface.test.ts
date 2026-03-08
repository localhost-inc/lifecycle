import { describe, expect, test } from "bun:test";
import { shouldShowNativeTerminalSurface } from "./native-terminal-surface";

describe("shouldShowNativeTerminalSurface", () => {
  test("hides the native surface while shell sidebar resizing is in progress", () => {
    expect(
      shouldShowNativeTerminalSurface({
        active: true,
        hasLiveSession: true,
        height: 640,
        isShellResizeInProgress: true,
        width: 960,
      }),
    ).toBeFalse();
  });

  test("requires an active live session with measurable bounds", () => {
    expect(
      shouldShowNativeTerminalSurface({
        active: true,
        hasLiveSession: true,
        height: 640,
        isShellResizeInProgress: false,
        width: 960,
      }),
    ).toBeTrue();
    expect(
      shouldShowNativeTerminalSurface({
        active: false,
        hasLiveSession: true,
        height: 640,
        isShellResizeInProgress: false,
        width: 960,
      }),
    ).toBeFalse();
    expect(
      shouldShowNativeTerminalSurface({
        active: true,
        hasLiveSession: false,
        height: 640,
        isShellResizeInProgress: false,
        width: 960,
      }),
    ).toBeFalse();
    expect(
      shouldShowNativeTerminalSurface({
        active: true,
        hasLiveSession: true,
        height: 1,
        isShellResizeInProgress: false,
        width: 960,
      }),
    ).toBeFalse();
  });
});

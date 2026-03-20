import { describe, expect, test } from "bun:test";
import {
  normalizeTurnNotificationMode,
  normalizeTurnNotificationSound,
  shouldNotifyForTurnCompletion,
} from "@/features/notifications/lib/notification-settings";

describe("turn notification settings", () => {
  test("normalizes invalid notification values to defaults", () => {
    expect(normalizeTurnNotificationMode("broken")).toBe("when-unfocused");
    expect(normalizeTurnNotificationSound("broken")).toBe("orbit");
  });

  test("keeps valid notification values", () => {
    expect(normalizeTurnNotificationMode("always")).toBe("always");
    expect(normalizeTurnNotificationSound("signal")).toBe("signal");
  });
});

describe("shouldNotifyForTurnCompletion", () => {
  test("always mode notifies even when the app is focused", () => {
    expect(
      shouldNotifyForTurnCompletion("always", {
        documentVisible: true,
        windowFocused: true,
      }),
    ).toBe(true);
  });

  test("when-unfocused mode requires the app to be hidden or unfocused", () => {
    expect(
      shouldNotifyForTurnCompletion("when-unfocused", {
        documentVisible: true,
        windowFocused: true,
      }),
    ).toBe(false);

    expect(
      shouldNotifyForTurnCompletion("when-unfocused", {
        documentVisible: false,
        windowFocused: true,
      }),
    ).toBe(true);

    expect(
      shouldNotifyForTurnCompletion("when-unfocused", {
        documentVisible: true,
        windowFocused: false,
      }),
    ).toBe(true);
  });

  test("off mode suppresses turn-complete notifications", () => {
    expect(
      shouldNotifyForTurnCompletion("off", {
        documentVisible: false,
        windowFocused: false,
      }),
    ).toBe(false);
  });
});

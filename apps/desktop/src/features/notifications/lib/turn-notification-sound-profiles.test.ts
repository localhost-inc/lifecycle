import { describe, expect, test } from "bun:test";
import {
  getTurnNotificationSoundProfile,
  turnNotificationSoundProfiles,
} from "./turn-notification-sound-profiles";

describe("turnNotificationSoundProfiles", () => {
  test("defines a unique profile for each sound option", () => {
    const values = turnNotificationSoundProfiles.map((profile) => profile.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual(["glass", "orbit", "signal", "silent"]);
  });

  test("exposes a sound lookup helper for runtime playback", () => {
    expect(getTurnNotificationSoundProfile("glass")).toMatchObject({
      label: "Glass",
      value: "glass",
    });
    expect(getTurnNotificationSoundProfile("silent").tones).toEqual([]);
  });
});

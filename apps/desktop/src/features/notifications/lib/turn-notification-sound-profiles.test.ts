import { describe, expect, test } from "bun:test";
import {
  getTurnNotificationSoundProfile,
  turnNotificationSoundProfiles,
} from "@/features/notifications/lib/turn-notification-sound-profiles";

describe("turnNotificationSoundProfiles", () => {
  test("defines a unique profile for each sound option", () => {
    const values = turnNotificationSoundProfiles.map((profile) => profile.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual([
      "orbit",
      "signal",
      "droplet",
      "pulse",
      "bells",
      "radar",
      "woodblock",
      "baritone",
      "silent",
    ]);
  });

  test("exposes a sound lookup helper for runtime playback", () => {
    expect(getTurnNotificationSoundProfile("orbit")).toMatchObject({
      label: "Orbit",
      value: "orbit",
    });
    expect(getTurnNotificationSoundProfile("silent").tones).toEqual([]);
  });
});

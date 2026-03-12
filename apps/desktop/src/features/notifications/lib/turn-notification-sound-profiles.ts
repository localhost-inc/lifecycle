export interface NotificationTone {
  at: number;
  duration: number;
  frequency: number;
  gain: number;
  type: OscillatorType;
}

interface TurnNotificationSoundProfileDefinition {
  description: string;
  label: string;
  tones: readonly NotificationTone[];
  value: string;
}

export const turnNotificationSoundProfiles = [
  {
    description: "A softer rising chime.",
    label: "Orbit",
    tones: [
      { at: 0, duration: 0.16, frequency: 659.25, gain: 0.08, type: "triangle" },
      { at: 0.1, duration: 0.24, frequency: 880, gain: 0.09, type: "sine" },
      { at: 0.22, duration: 0.28, frequency: 1174.66, gain: 0.07, type: "triangle" },
    ],
    value: "orbit",
  },
  {
    description: "A crisp triple pulse.",
    label: "Signal",
    tones: [
      { at: 0, duration: 0.08, frequency: 740, gain: 0.07, type: "square" },
      { at: 0.14, duration: 0.08, frequency: 932.33, gain: 0.07, type: "square" },
      { at: 0.28, duration: 0.14, frequency: 1174.66, gain: 0.06, type: "square" },
    ],
    value: "signal",
  },
  {
    description: "A quick descending water drop.",
    label: "Droplet",
    tones: [
      { at: 0, duration: 0.1, frequency: 1396.91, gain: 0.1, type: "sine" },
      { at: 0.07, duration: 0.14, frequency: 880, gain: 0.07, type: "sine" },
    ],
    value: "droplet",
  },
  {
    description: "A single warm thud.",
    label: "Pulse",
    tones: [{ at: 0, duration: 0.12, frequency: 261.63, gain: 0.1, type: "triangle" }],
    value: "pulse",
  },
  {
    description: "A soft doorbell ding-dong.",
    label: "Bells",
    tones: [
      { at: 0, duration: 0.3, frequency: 659.25, gain: 0.09, type: "sine" },
      { at: 0.15, duration: 0.35, frequency: 523.25, gain: 0.08, type: "sine" },
    ],
    value: "bells",
  },
  {
    description: "A subtle sci-fi ping.",
    label: "Radar",
    tones: [
      { at: 0, duration: 0.2, frequency: 1174.66, gain: 0.1, type: "sine" },
      { at: 0.12, duration: 0.18, frequency: 1174.66, gain: 0.06, type: "sine" },
    ],
    value: "radar",
  },
  {
    description: "A dry percussive knock.",
    label: "Woodblock",
    tones: [
      { at: 0, duration: 0.05, frequency: 783.99, gain: 0.09, type: "square" },
      { at: 0.1, duration: 0.05, frequency: 783.99, gain: 0.07, type: "square" },
    ],
    value: "woodblock",
  },
  {
    description: "A deep resonant hum.",
    label: "Baritone",
    tones: [
      { at: 0, duration: 0.22, frequency: 146.83, gain: 0.13, type: "triangle" },
      { at: 0.03, duration: 0.28, frequency: 220, gain: 0.08, type: "sine" },
    ],
    value: "baritone",
  },
  {
    description: "No sound.",
    label: "Silent",
    tones: [],
    value: "silent",
  },
] as const satisfies readonly TurnNotificationSoundProfileDefinition[];

export type TurnNotificationSound = (typeof turnNotificationSoundProfiles)[number]["value"];
export type TurnNotificationSoundProfile = (typeof turnNotificationSoundProfiles)[number];

const turnNotificationSoundProfileByValue = new Map(
  turnNotificationSoundProfiles.map((profile) => [profile.value, profile]),
);

export function getTurnNotificationSoundProfile(
  sound: TurnNotificationSound,
): TurnNotificationSoundProfile {
  const profile = turnNotificationSoundProfileByValue.get(sound);
  if (!profile) {
    throw new Error(`Unknown turn notification sound: ${sound}`);
  }

  return profile;
}

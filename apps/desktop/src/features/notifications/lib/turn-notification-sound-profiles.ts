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
    description: "A bright two-note glass tap.",
    label: "Glass",
    tones: [
      { at: 0, duration: 0.18, frequency: 1046.5, gain: 0.12, type: "triangle" },
      { at: 0.12, duration: 0.26, frequency: 1567.98, gain: 0.08, type: "sine" },
    ],
    value: "glass",
  },
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

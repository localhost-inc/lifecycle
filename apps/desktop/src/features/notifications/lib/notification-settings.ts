import {
  turnNotificationSoundProfiles,
  type TurnNotificationSound,
} from "./turn-notification-sound-profiles";

export type TurnNotificationMode = "always" | "when-unfocused" | "off";
export type { TurnNotificationSound } from "./turn-notification-sound-profiles";

export interface TurnNotificationAttentionState {
  documentVisible: boolean;
  windowFocused: boolean;
}

export const DEFAULT_TURN_NOTIFICATION_MODE: TurnNotificationMode = "when-unfocused";
export const DEFAULT_TURN_NOTIFICATION_SOUND: TurnNotificationSound = "glass";

export const turnNotificationModeOptions: Array<{
  description: string;
  label: string;
  value: TurnNotificationMode;
}> = [
  {
    description: "Send a turn-complete notification every time a harness reply finishes.",
    label: "Always",
    value: "always",
  },
  {
    description: "Only notify when Lifecycle is hidden or not focused.",
    label: "When unfocused",
    value: "when-unfocused",
  },
  {
    description: "Keep tab-level response indicators only and skip desktop notifications.",
    label: "Off",
    value: "off",
  },
];

export const turnNotificationSoundOptions = turnNotificationSoundProfiles.map((profile) => ({
  description: profile.description,
  label: profile.label,
  value: profile.value,
}));

const TURN_NOTIFICATION_MODE_SET = new Set<TurnNotificationMode>(
  turnNotificationModeOptions.map((option) => option.value),
);
const TURN_NOTIFICATION_SOUND_SET = new Set<TurnNotificationSound>(
  turnNotificationSoundProfiles.map((profile) => profile.value),
);

export function isTurnNotificationMode(value: unknown): value is TurnNotificationMode {
  return typeof value === "string" && TURN_NOTIFICATION_MODE_SET.has(value as TurnNotificationMode);
}

export function isTurnNotificationSound(value: unknown): value is TurnNotificationSound {
  return (
    typeof value === "string" && TURN_NOTIFICATION_SOUND_SET.has(value as TurnNotificationSound)
  );
}

export function normalizeTurnNotificationMode(
  value: unknown,
  fallback: TurnNotificationMode = DEFAULT_TURN_NOTIFICATION_MODE,
): TurnNotificationMode {
  return isTurnNotificationMode(value) ? value : fallback;
}

export function normalizeTurnNotificationSound(
  value: unknown,
  fallback: TurnNotificationSound = DEFAULT_TURN_NOTIFICATION_SOUND,
): TurnNotificationSound {
  return isTurnNotificationSound(value) ? value : fallback;
}

export function shouldNotifyForTurnCompletion(
  mode: TurnNotificationMode,
  attentionState: TurnNotificationAttentionState,
): boolean {
  switch (mode) {
    case "always":
      return true;
    case "off":
      return false;
    case "when-unfocused":
      return !attentionState.documentVisible || !attentionState.windowFocused;
  }
}

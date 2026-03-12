import type { LifecycleEventOf } from "@lifecycle/contracts";
import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted as isTauriNotificationPermissionGranted,
  requestPermission as requestTauriNotificationPermission,
  sendNotification as sendTauriNotification,
} from "@tauri-apps/plugin-notification";
import type { TurnNotificationSound } from "./notification-settings";
import { getTurnNotificationSoundProfile } from "./turn-notification-sound-profiles";

let sharedAudioContext: AudioContext | null = null;

function providerLabel(provider: string | null): string {
  if (provider === "claude") {
    return "Claude";
  }

  if (provider === "codex") {
    return "Codex";
  }

  return "Harness";
}

function shortSessionId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const segments = value.split("-").filter((segment) => segment.length > 0);
  const preferredSegment = segments.at(-1) ?? value;
  return preferredSegment.slice(0, 8);
}

export function createTurnCompletionNotificationCopy(
  event: LifecycleEventOf<"terminal.harness_turn_completed">,
): {
  body: string;
  title: string;
} {
  const sessionId = shortSessionId(event.harness_session_id);

  return {
    body: sessionId
      ? `Session ${sessionId} has a response ready in Lifecycle.`
      : "Lifecycle has a response ready.",
    title: `${providerLabel(event.harness_provider)} turn completed`,
  };
}

async function ensureBrowserNotificationPermission(): Promise<boolean> {
  if (typeof Notification !== "function") {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  return (await Notification.requestPermission()) === "granted";
}

async function ensureTauriNotificationPermission(): Promise<boolean> {
  if (await isTauriNotificationPermissionGranted()) {
    return true;
  }

  return (await requestTauriNotificationPermission()) === "granted";
}

export async function sendTurnCompletionNotification(
  event: LifecycleEventOf<"terminal.harness_turn_completed">,
): Promise<void> {
  const notification = createTurnCompletionNotificationCopy(event);

  if (isTauri()) {
    if (!(await ensureTauriNotificationPermission())) {
      return;
    }

    await sendTauriNotification(notification);
    return;
  }

  if (!(await ensureBrowserNotificationPermission()) || typeof Notification !== "function") {
    return;
  }

  new Notification(notification.title, { body: notification.body });
}

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const webkitAudioContext = (window as Window & { webkitAudioContext?: AudioContextConstructor })
    .webkitAudioContext;

  return window.AudioContext ?? webkitAudioContext ?? null;
}

function getSharedAudioContext(): AudioContext | null {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return null;
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextConstructor();
  }

  return sharedAudioContext;
}

export async function playTurnNotificationSound(sound: TurnNotificationSound): Promise<void> {
  const profile = getTurnNotificationSoundProfile(sound);
  if (profile.tones.length === 0) {
    return;
  }

  const context = getSharedAudioContext();
  if (!context) {
    return;
  }

  const output = context.createGain();
  output.gain.value = 0.8;
  output.connect(context.destination);

  try {
    if (context.state === "suspended") {
      await context.resume();
    }

    const startTime = context.currentTime + 0.01;

    for (const tone of profile.tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = startTime + tone.at;
      const toneEnd = toneStart + tone.duration;

      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(tone.frequency, toneStart);

      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(tone.gain, toneStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.02);
    }
  } finally {
    const disconnectAt =
      (profile.tones.at(-1)?.at ?? 0) + (profile.tones.at(-1)?.duration ?? 0) + 0.2;
    window.setTimeout(() => {
      output.disconnect();
    }, disconnectAt * 1000);
  }
}

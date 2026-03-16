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

  return "Agent";
}

export interface TurnCompletionNotificationContext {
  projectName?: string | null;
  sessionTitle?: string | null;
  workspaceName?: string | null;
}

function formatLocation(projectName?: string | null, workspaceName?: string | null): string | null {
  const project = projectName?.trim();
  const workspace = workspaceName?.trim();

  if (project && workspace) {
    return `${project}:${workspace}`;
  }

  return project || workspace || null;
}

export function createTurnCompletionNotificationCopy(
  event: LifecycleEventOf<"terminal.harness_turn_completed">,
  context?: TurnCompletionNotificationContext,
): {
  body: string;
  title: string;
} {
  const provider = providerLabel(event.harness_provider);
  const sessionTitle = context?.sessionTitle?.trim();
  const location = formatLocation(context?.projectName, context?.workspaceName);

  const title = sessionTitle || "Response ready";
  const body = location
    ? `${provider} finished in ${location}.`
    : `${provider} has a response ready.`;

  return { body, title };
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
  context?: TurnCompletionNotificationContext,
): Promise<void> {
  const notification = createTurnCompletionNotificationCopy(event, context);

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

/**
 * Warm the shared AudioContext so subsequent playTurnNotificationSound calls
 * start instantly. Call this on any user interaction (click, pointer-down) to
 * prevent the browser/webview from auto-suspending the context between plays.
 */
export function warmAudioContext(): void {
  const context = getSharedAudioContext();
  if (context?.state === "suspended") {
    void context.resume();
  }
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

  if (context.state === "suspended") {
    await context.resume();
  }

  const output = context.createGain();
  output.gain.value = 0.8;
  output.connect(context.destination);

  const startTime = context.currentTime;

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

  const disconnectAt =
    (profile.tones.at(-1)?.at ?? 0) + (profile.tones.at(-1)?.duration ?? 0) + 0.2;
  window.setTimeout(() => {
    output.disconnect();
  }, disconnectAt * 1000);
}

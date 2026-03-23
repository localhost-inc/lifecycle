import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted as isTauriNotificationPermissionGranted,
  onAction as onTauriNotificationAction,
  requestPermission as requestTauriNotificationPermission,
  sendNotification as sendTauriNotification,
} from "@tauri-apps/plugin-notification";
import type { TurnNotificationSound } from "@/features/notifications/lib/notification-settings";
import { getTurnNotificationSoundProfile } from "@/features/notifications/lib/turn-notification-sound-profiles";

let sharedAudioContext: AudioContext | null = null;

export interface TurnCompletionNotificationContext {
  projectId?: string | null;
  projectName?: string | null;
  providerName?: string | null;
  sessionTitle?: string | null;
  sessionId?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
}

export interface TurnCompletionLifecycleEvent {
  session_id: string;
  turn_id: string;
  workspace_id: string;
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
  event: TurnCompletionLifecycleEvent,
  context?: TurnCompletionNotificationContext,
): {
  body: string;
  title: string;
} {
  const provider = context?.providerName?.trim() || "Agent";
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

export interface NotificationNavigationData {
  projectId: string;
  sessionId?: string;
  workspaceId: string;
}

function buildNavigationExtra(
  context?: TurnCompletionNotificationContext,
): NotificationNavigationData | null {
  const projectId = context?.projectId;
  const workspaceId = context?.workspaceId;
  const sessionId = context?.sessionId;

  if (!projectId || !workspaceId) {
    return null;
  }

  return sessionId ? { projectId, sessionId, workspaceId } : { projectId, workspaceId };
}

export async function sendTurnCompletionNotification(
  event: TurnCompletionLifecycleEvent,
  context?: TurnCompletionNotificationContext,
): Promise<void> {
  const notification = createTurnCompletionNotificationCopy(event, context);
  const navigation = buildNavigationExtra(context);

  if (isTauri()) {
    if (!(await ensureTauriNotificationPermission())) {
      return;
    }

    await sendTauriNotification({
      ...notification,
      extra: navigation ? { ...navigation } : undefined,
    });
    return;
  }

  if (!(await ensureBrowserNotificationPermission()) || typeof Notification !== "function") {
    return;
  }

  const browserNotification = new Notification(notification.title, { body: notification.body });
  if (navigation) {
    browserNotification.onclick = () => {
      window.focus();
      dispatchNotificationNavigation(navigation);
    };
  }
}

function dispatchNotificationNavigation(navigation: NotificationNavigationData): void {
  window.dispatchEvent(new CustomEvent("lifecycle:notification-navigate", { detail: navigation }));
}

/**
 * Register a listener for notification click navigation events. Returns an
 * unlisten function. In Tauri, this listens for native notification actions.
 * In browser, this listens for the custom `lifecycle:notification-navigate` event.
 */
export async function listenForNotificationClicks(
  callback: (navigation: NotificationNavigationData) => void,
): Promise<() => void> {
  const cleanups: Array<() => void> = [];

  if (isTauri()) {
    const listener = await onTauriNotificationAction((notification) => {
      const extra = notification.extra as Record<string, unknown> | undefined;
      const projectId = typeof extra?.projectId === "string" ? extra.projectId : null;
      const workspaceId = typeof extra?.workspaceId === "string" ? extra.workspaceId : null;
      const sessionId = typeof extra?.sessionId === "string" ? extra.sessionId : undefined;

      if (projectId && workspaceId) {
        callback({ projectId, sessionId, workspaceId });
      }
    });
    cleanups.push(() => listener.unregister());
  }

  // Also listen for browser-originated navigation events (used by browser Notification onclick)
  const handleCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<NotificationNavigationData>).detail;
    if (detail.projectId && detail.workspaceId) {
      callback(detail);
    }
  };

  window.addEventListener("lifecycle:notification-navigate", handleCustomEvent);
  cleanups.push(() =>
    window.removeEventListener("lifecycle:notification-navigate", handleCustomEvent),
  );

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
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

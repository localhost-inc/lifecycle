import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LifecycleEvent,
  LifecycleEventInput,
  LifecycleEventOf,
  LifecycleEventKind,
} from "@lifecycle/contracts";

export const LIFECYCLE_EVENT_NAME = "lifecycle:event";

const browserListeners = new Set<(event: LifecycleEvent) => void>();

function createEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function publishBrowserLifecycleEvent(event: LifecycleEventInput): LifecycleEvent {
  const nextEvent = {
    ...event,
    id: createEventId(),
    occurred_at: new Date().toISOString(),
  } as LifecycleEvent;

  for (const listener of browserListeners) {
    listener(nextEvent);
  }

  return nextEvent;
}

export async function subscribeToLifecycleEvents<Kinds extends readonly LifecycleEventKind[]>(
  kinds: Kinds,
  listener: (event: LifecycleEventOf<Kinds[number]>) => void,
): Promise<UnlistenFn>;
export async function subscribeToLifecycleEvents(
  kinds: readonly LifecycleEventKind[],
  listener: (event: LifecycleEvent) => void,
): Promise<UnlistenFn> {
  if (kinds.length === 0) {
    return () => {};
  }

  const kindSet = new Set(kinds);
  const handleEvent = (event: LifecycleEvent) => {
    if (!kindSet.has(event.kind)) {
      return;
    }

    listener(event);
  };

  if (!isTauri()) {
    browserListeners.add(handleEvent);
    return () => {
      browserListeners.delete(handleEvent);
    };
  }

  return listen<LifecycleEvent>(LIFECYCLE_EVENT_NAME, (event) => {
    handleEvent(event.payload);
  });
}

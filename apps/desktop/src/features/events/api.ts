import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LifecycleEvent,
  LifecycleEventInput,
  LifecycleEventOf,
  LifecycleEventType,
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

export async function subscribeToLifecycleEvents<Types extends readonly LifecycleEventType[]>(
  types: Types,
  listener: (event: LifecycleEventOf<Types[number]>) => void,
): Promise<UnlistenFn>;
export async function subscribeToLifecycleEvents(
  types: readonly LifecycleEventType[],
  listener: (event: LifecycleEvent) => void,
): Promise<UnlistenFn> {
  if (types.length === 0) {
    return () => {};
  }

  const typeSet = new Set(types);
  const handleEvent = (event: LifecycleEvent) => {
    if (!typeSet.has(event.type)) {
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

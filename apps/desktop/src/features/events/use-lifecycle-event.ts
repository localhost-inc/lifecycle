import type { LifecycleEvent, LifecycleEventOf, LifecycleEventKind } from "@lifecycle/contracts";
import { useEffect, useRef } from "react";
import { subscribeToLifecycleEvents } from "@/features/events/api";

export function useLifecycleEvent<Kind extends LifecycleEventKind>(
  kind: Kind,
  listener: (event: LifecycleEventOf<Kind>) => void,
): void;
export function useLifecycleEvent<Kinds extends readonly LifecycleEventKind[]>(
  kinds: Kinds,
  listener: (event: LifecycleEventOf<Kinds[number]>) => void,
): void;
export function useLifecycleEvent(
  kinds: LifecycleEventKind | readonly LifecycleEventKind[],
  listener: (event: LifecycleEvent) => void,
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  const eventKinds = Array.isArray(kinds) ? [...kinds] : [kinds];
  const eventKindsKey = [...new Set(eventKinds)].sort().join("\0");

  useEffect(() => {
    if (eventKinds.length === 0) {
      return;
    }

    let disposed = false;
    let stop: (() => void) | null = null;

    void subscribeToLifecycleEvents(eventKinds, (event) => {
      listenerRef.current(event);
    })
      .then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
          return;
        }

        stop = unsubscribe;
      })
      .catch((error) => {
        console.error("Failed to subscribe to lifecycle events:", error);
      });

    return () => {
      disposed = true;
      stop?.();
    };
  }, [eventKindsKey]);
}

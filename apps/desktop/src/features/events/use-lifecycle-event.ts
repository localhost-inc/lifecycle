import type { LifecycleEvent, LifecycleEventOf, LifecycleEventType } from "@lifecycle/contracts";
import { useEffect, useRef } from "react";
import { subscribeToLifecycleEvents } from "./api";

export function useLifecycleEvent<Type extends LifecycleEventType>(
  type: Type,
  listener: (event: LifecycleEventOf<Type>) => void,
): void;
export function useLifecycleEvent<Types extends readonly LifecycleEventType[]>(
  types: Types,
  listener: (event: LifecycleEventOf<Types[number]>) => void,
): void;
export function useLifecycleEvent(
  types: LifecycleEventType | readonly LifecycleEventType[],
  listener: (event: LifecycleEvent) => void,
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  const eventTypes = Array.isArray(types) ? [...types] : [types];
  const eventTypesKey = [...new Set(eventTypes)].sort().join("\0");

  useEffect(() => {
    if (eventTypes.length === 0) {
      return;
    }

    let disposed = false;
    let stop: (() => void) | null = null;

    void subscribeToLifecycleEvents(eventTypes, (event) => {
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
  }, [eventTypesKey]);
}

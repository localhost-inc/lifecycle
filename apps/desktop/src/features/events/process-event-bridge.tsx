import { useEffect } from "react";
import { startProcessEventBridge, stopProcessEventBridge } from "@/features/events/process-events";

export function ProcessEventBridge() {
  useEffect(() => {
    void startProcessEventBridge();
    return () => {
      stopProcessEventBridge();
    };
  }, []);

  return null;
}

import { useEffect, useRef } from "react";
import { useLifecycleEvent } from "../events";
import { useSettings } from "../settings/state/app-settings-provider";
import { shouldNotifyForTurnCompletion } from "./lib/notification-settings";
import {
  playTurnNotificationSound,
  sendTurnCompletionNotification,
} from "./lib/turn-notification-runtime";

function readTurnNotificationAttentionState() {
  if (typeof document === "undefined") {
    return {
      documentVisible: true,
      windowFocused: true,
    };
  }

  return {
    documentVisible: document.visibilityState === "visible",
    windowFocused: document.hasFocus(),
  };
}

export function TurnNotificationListener() {
  const { turnNotificationSound, turnNotificationsMode } = useSettings();
  const attentionStateRef = useRef(readTurnNotificationAttentionState());

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncAttentionState = () => {
      attentionStateRef.current = readTurnNotificationAttentionState();
    };

    syncAttentionState();

    document.addEventListener("visibilitychange", syncAttentionState);
    window.addEventListener("focus", syncAttentionState);
    window.addEventListener("blur", syncAttentionState);

    return () => {
      document.removeEventListener("visibilitychange", syncAttentionState);
      window.removeEventListener("focus", syncAttentionState);
      window.removeEventListener("blur", syncAttentionState);
    };
  }, []);

  useLifecycleEvent("terminal.harness_turn_completed", (event) => {
    if (!shouldNotifyForTurnCompletion(turnNotificationsMode, attentionStateRef.current)) {
      return;
    }

    void sendTurnCompletionNotification(event).catch((error) => {
      console.error("Failed to send turn-complete notification:", error);
    });
    void playTurnNotificationSound(turnNotificationSound).catch((error) => {
      console.error("Failed to play turn-complete notification sound:", error);
    });
  });

  return null;
}

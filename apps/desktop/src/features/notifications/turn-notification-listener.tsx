import { useEffect, useRef } from "react";
import { useQueryClient } from "../../query";
import { useLifecycleEvent } from "../events";
import { projectCatalogQuery } from "../projects/hooks";
import { useSettings } from "../settings/state/app-settings-provider";
import { createWorkspaceSnapshotQuery } from "../workspaces/hooks";
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

const recentCompletionKeys = new Set<string>();

export function TurnNotificationListener() {
  const { turnNotificationSound, turnNotificationsMode } = useSettings();
  const attentionStateRef = useRef(readTurnNotificationAttentionState());
  const queryClient = useQueryClient();

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

    if (recentCompletionKeys.has(event.completion_key)) {
      return;
    }
    recentCompletionKeys.add(event.completion_key);
    setTimeout(() => recentCompletionKeys.delete(event.completion_key), 5_000);

    const snapshot = queryClient.getSnapshot(createWorkspaceSnapshotQuery(event.workspace_id));
    const terminal = snapshot.data?.terminals.find((t) => t.id === event.terminal_id);
    const projectId = snapshot.data?.workspace?.project_id;
    const catalog = queryClient.getSnapshot(projectCatalogQuery);
    const project = projectId
      ? catalog.data?.projects.find((p) => p.id === projectId)
      : undefined;

    void sendTurnCompletionNotification(event, {
      projectName: project?.name,
      sessionTitle: terminal?.label,
      workspaceName: snapshot.data?.workspace?.name,
    }).catch((error) => {
      console.error("Failed to send turn-complete notification:", error);
    });
    void playTurnNotificationSound(turnNotificationSound).catch((error) => {
      console.error("Failed to play turn-complete notification sound:", error);
    });
  });

  return null;
}

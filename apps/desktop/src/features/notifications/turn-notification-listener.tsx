import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useQueryClient } from "../../query";
import { router } from "../../app/router";
import { useLifecycleEvent } from "../events";
import { projectCatalogQuery } from "../projects/hooks";
import { useSettings } from "../settings/state/app-settings-provider";
import { createWorkspaceSnapshotQuery } from "../workspaces/hooks";
import { setPendingTerminalFocus } from "./lib/notification-navigation";
import { shouldNotifyForTurnCompletion } from "./lib/notification-settings";
import {
  listenForNotificationClicks,
  playTurnNotificationSound,
  sendTurnCompletionNotification,
  type NotificationNavigationData,
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

async function focusAppWindow(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  await appWindow.setFocus();
}

function handleNotificationNavigation(navigation: NotificationNavigationData): void {
  const { projectId, terminalId, workspaceId } = navigation;
  const targetPath = `/projects/${projectId}/workspaces/${workspaceId}`;

  setPendingTerminalFocus(workspaceId, terminalId);
  void router.navigate(targetPath);
  void focusAppWindow().catch((error) => {
    console.error("Failed to focus app window:", error);
  });

  // Also dispatch focus-terminal for the case where the workspace is already mounted
  window.requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent("lifecycle:focus-terminal", {
        detail: { terminalId, workspaceId },
      }),
    );
  });
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

  // Listen for notification clicks and navigate to the appropriate workspace/terminal
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void listenForNotificationClicks(handleNotificationNavigation).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
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

    const context = {
      projectId: projectId ?? null,
      projectName: project?.name,
      sessionTitle: terminal?.label,
      terminalId: event.terminal_id,
      workspaceId: event.workspace_id,
      workspaceName: snapshot.data?.workspace?.name,
    };

    void sendTurnCompletionNotification(event, context).catch((error) => {
      console.error("Failed to send turn-complete notification:", error);
    });

    void playTurnNotificationSound(turnNotificationSound).catch((error) => {
      console.error("Failed to play notification sound:", error);
    });
  });

  return null;
}

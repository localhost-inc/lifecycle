import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { selectAgentSessionById } from "@lifecycle/store";
import { useStoreContext } from "@/store/provider";
import { useProjects } from "@/store";
import { router } from "@/app/router";
import { useLifecycleEvent } from "@/features/events";
import { useSettings } from "@/features/settings/state/settings-context";
import { shouldNotifyForTurnCompletion } from "@/features/notifications/lib/notification-settings";
import {
  listenForNotificationClicks,
  playTurnNotificationSound,
  sendTurnCompletionNotification,
  type NotificationNavigationData,
} from "@/features/notifications/lib/turn-notification-runtime";

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
  const { projectId, workspaceId } = navigation;
  const targetPath = `/projects/${projectId}/workspaces/${workspaceId}`;

  void router.navigate(targetPath);
  void focusAppWindow().catch((error) => {
    console.error("Failed to focus app window:", error);
  });
}

const recentCompletionKeys = new Set<string>();

export function AppNotifier() {
  const { turnNotificationSound, turnNotificationsMode } = useSettings();
  const attentionStateRef = useRef(readTurnNotificationAttentionState());
  const { collections, driver } = useStoreContext();
  const projects = useProjects();

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

  // Listen for notification clicks and navigate to the appropriate workspace.
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

  useLifecycleEvent("agent.turn.completed", (event) => {
    if (!shouldNotifyForTurnCompletion(turnNotificationsMode, attentionStateRef.current)) {
      return;
    }

    const completionKey = `${event.sessionId}:${event.turnId}`;
    if (recentCompletionKeys.has(completionKey)) {
      return;
    }
    recentCompletionKeys.add(completionKey);
    setTimeout(() => recentCompletionKeys.delete(completionKey), 5_000);

    void (async () => {
      const workspace = collections.workspaces.collection.get(event.workspaceId);
      const projectId = workspace?.project_id;
      const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
      const session = await selectAgentSessionById(driver, event.sessionId);
      const context = {
        projectId: projectId ?? null,
        projectName: project?.name,
        providerName:
          session?.provider === "claude"
            ? "Claude"
            : session?.provider === "codex"
              ? "Codex"
              : "Agent",
        sessionId: event.sessionId,
        sessionTitle: session?.title ?? null,
        workspaceId: event.workspaceId,
        workspaceName: workspace?.name,
      };

      await sendTurnCompletionNotification(event, context);
    })().catch((error) => {
      console.error("Failed to send turn-complete notification:", error);
    });

    void playTurnNotificationSound(turnNotificationSound).catch((error) => {
      console.error("Failed to play notification sound:", error);
    });
  });

  return null;
}

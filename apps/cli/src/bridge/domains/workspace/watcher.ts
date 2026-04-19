import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { listAllWorkspaces } from "@lifecycle/db/queries";
import type { WorkspaceHostRegistry } from "./registry";

const WORKSPACE_WATCH_SYNC_INTERVAL_MS = 5_000;
const WORKSPACE_INVALIDATION_DEBOUNCE_MS = 250;

type WorkspaceSubscription = {
  cleanup: () => void;
  host: WorkspaceRecord["host"];
  workspaceRoot: string | null;
};

export interface WorkspaceWatchManager {
  sync(): Promise<void>;
  stop(): void;
}

export function createWorkspaceWatchManager(input: {
  db: SqlDriver;
  workspaceRegistry: WorkspaceHostRegistry;
  onWorkspaceInvalidated?: (workspaceId: string) => void;
}): WorkspaceWatchManager {
  const onWorkspaceInvalidated = input.onWorkspaceInvalidated ?? (() => {});

  const subscriptions = new Map<string, WorkspaceSubscription>();
  const invalidationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const syncTimer = setInterval(() => {
    void sync();
  }, WORKSPACE_WATCH_SYNC_INTERVAL_MS);

  let syncInFlight: Promise<void> | null = null;

  async function sync(): Promise<void> {
    if (syncInFlight) {
      return syncInFlight;
    }

    syncInFlight = (async () => {
      const workspaces = (await listAllWorkspaces(input.db)).filter(
        (workspace) => workspace.status !== "archived",
      );
      const nextWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));

      for (const [workspaceId, subscription] of subscriptions) {
        if (!nextWorkspaceIds.has(workspaceId)) {
          subscription.cleanup();
          subscriptions.delete(workspaceId);
        }
      }

      for (const workspace of workspaces) {
        const existing = subscriptions.get(workspace.id);
        if (
          existing &&
          existing.host === workspace.host &&
          existing.workspaceRoot === workspace.workspace_root
        ) {
          continue;
        }

        existing?.cleanup();
        subscriptions.delete(workspace.id);

        try {
          const cleanup = await input.workspaceRegistry.resolve(workspace.host).subscribeFileEvents(
            {
              workspaceId: workspace.id,
              workspaceRoot: workspace.workspace_root,
            },
            () => scheduleWorkspaceInvalidation(workspace.id),
          );

          subscriptions.set(workspace.id, {
            cleanup,
            host: workspace.host,
            workspaceRoot: workspace.workspace_root,
          });
        } catch {
          // Unsupported hosts or watcher failures should not crash the bridge.
        }
      }
    })().finally(() => {
      syncInFlight = null;
    });

    return syncInFlight;
  }

  function scheduleWorkspaceInvalidation(workspaceId: string): void {
    const existingTimer = invalidationTimers.get(workspaceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    invalidationTimers.set(
      workspaceId,
      setTimeout(() => {
        invalidationTimers.delete(workspaceId);
        onWorkspaceInvalidated(workspaceId);
      }, WORKSPACE_INVALIDATION_DEBOUNCE_MS),
    );
  }

  return {
    sync,
    stop() {
      clearInterval(syncTimer);
      for (const timer of invalidationTimers.values()) {
        clearTimeout(timer);
      }
      invalidationTimers.clear();
      for (const subscription of subscriptions.values()) {
        subscription.cleanup();
      }
      subscriptions.clear();
    },
  };
}

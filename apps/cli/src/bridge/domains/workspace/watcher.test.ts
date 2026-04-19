import { describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { createWorkspaceHostRegistry } from ".";
import type {
  SubscribeWorkspaceFileEventsInput,
  WorkspaceFileEventListener,
  WorkspaceFileEventSubscription,
} from "./host";
import { createWorkspaceWatchManager } from "./watcher";

function workspaceRecord(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: "ws_123",
    repository_id: "repo_123",
    name: "main",
    slug: "main",
    checkout_type: "worktree",
    source_ref: "main",
    git_sha: null,
    workspace_root: "/tmp/workspace",
    host: "local",
    manifest_fingerprint: null,
    prepared_at: null,
    status: "active",
    failure_reason: null,
    failed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_active_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspace watch manager", () => {
  test("notifies workspace invalidation when watched files change", async () => {
    const workspaces = [workspaceRecord()];
    const db: SqlDriver = {
      async select() {
        return workspaces as never[];
      },
      async execute() {
        return { rowsAffected: 0 };
      },
      async transaction() {
        return { rowsAffected: [] };
      },
    };

    const captured: { listener: (() => void) | null } = { listener: null };
    const cleanup = mock(() => {});
    const cleanupSubscription: WorkspaceFileEventSubscription = () => {
      cleanup();
    };
    const onWorkspaceInvalidated = mock(() => {});

    const registry = createWorkspaceHostRegistry({
      local: {
        subscribeFileEvents: async (
          _input: SubscribeWorkspaceFileEventsInput,
          nextListener: WorkspaceFileEventListener,
        ) => {
          captured.listener = () => void nextListener({ kind: "changed", workspaceId: "ws_123" });
          return cleanupSubscription;
        },
      } as never,
    });

    const manager = createWorkspaceWatchManager({
      db,
      workspaceRegistry: registry,
      onWorkspaceInvalidated,
    });
    await manager.sync();

    captured.listener?.();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onWorkspaceInvalidated).toHaveBeenCalledWith("ws_123");

    manager.stop();
  });

  test("cleans up subscriptions when a workspace disappears", async () => {
    const workspaces = [workspaceRecord()];
    const db: SqlDriver = {
      async select() {
        return workspaces as never[];
      },
      async execute() {
        return { rowsAffected: 0 };
      },
      async transaction() {
        return { rowsAffected: [] };
      },
    };

    const cleanup = mock(() => {});
    const cleanupSubscription: WorkspaceFileEventSubscription = () => {
      cleanup();
    };
    const registry = createWorkspaceHostRegistry({
      local: {
        subscribeFileEvents: async () => cleanupSubscription,
      } as never,
    });

    const manager = createWorkspaceWatchManager({
      db,
      workspaceRegistry: registry,
    });
    await manager.sync();

    workspaces.length = 0;
    await manager.sync();

    expect(cleanup).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});

import { describe, expect, test } from "bun:test";
import type { LifecycleEvent } from "@lifecycle/contracts";
import { gitKeys } from "@/features/git/state/git-query-keys";
import { terminalKeys } from "@/features/terminals/queries";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { QueryClient, type QueryDescriptor } from "@/query/client";
import {
  getInvalidationTargetsForLifecycleEvent,
  invalidateQueriesForLifecycleEvent,
} from "@/query/invalidation";
import type { QuerySource } from "@/query/source";

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("getInvalidationTargetsForLifecycleEvent", () => {
  test("targets workspace list, detail, and activity for workspace rename events", () => {
    const event: LifecycleEvent = {
      id: "event-1",
      kind: "workspace.renamed",
      name: "Renamed",
      occurred_at: "2026-03-20T12:00:00.000Z",
      source_ref: "feature/refactor",
      workspace_id: "ws-1",
      worktree_path: "/tmp/ws-1",
    };

    expect(getInvalidationTargetsForLifecycleEvent(event)).toEqual([
      { kind: "exact", key: workspaceKeys.byProject() },
      { kind: "exact", key: workspaceKeys.detail("ws-1") },
      { kind: "exact", key: workspaceKeys.activity("ws-1") },
    ]);
  });

  test("targets workspace logs only when the workspace enters preparing", () => {
    const startingEvent: LifecycleEvent = {
      id: "event-1",
      kind: "workspace.status_changed",
      failure_reason: null,
      occurred_at: "2026-03-20T12:00:00.000Z",
      status: "preparing",
      workspace_id: "ws-1",
    };
    const idleEvent: LifecycleEvent = {
      ...startingEvent,
      id: "event-2",
      status: "active",
    };

    expect(getInvalidationTargetsForLifecycleEvent(startingEvent)).toEqual([
      { kind: "exact", key: workspaceKeys.byProject() },
      { kind: "exact", key: workspaceKeys.detail("ws-1") },
      { kind: "exact", key: workspaceKeys.services("ws-1") },
      { kind: "exact", key: workspaceKeys.serviceLogs("ws-1") },
      { kind: "exact", key: workspaceKeys.activity("ws-1") },
    ]);

    expect(getInvalidationTargetsForLifecycleEvent(idleEvent)).toEqual([
      { kind: "exact", key: workspaceKeys.byProject() },
      { kind: "exact", key: workspaceKeys.detail("ws-1") },
      { kind: "exact", key: workspaceKeys.services("ws-1") },
      { kind: "exact", key: workspaceKeys.activity("ws-1") },
    ]);
  });

  test("targets services and activity for service status changes", () => {
    const event: LifecycleEvent = {
      id: "event-1",
      kind: "service.status_changed",
      name: "web",
      occurred_at: "2026-03-20T12:00:00.000Z",
      status: "ready",
      status_reason: null,
      workspace_id: "ws-1",
    };

    expect(getInvalidationTargetsForLifecycleEvent(event)).toEqual([
      { kind: "exact", key: workspaceKeys.services("ws-1") },
      { kind: "exact", key: workspaceKeys.activity("ws-1") },
    ]);
  });

  test("targets terminal list for terminal lifecycle events", () => {
    const event: LifecycleEvent = {
      id: "event-1",
      kind: "terminal.updated",
      occurred_at: "2026-03-20T12:00:00.000Z",
      terminal: {
        created_by: null,
        ended_at: null,
        exit_code: null,
        failure_reason: null,
        harness_provider: "codex",
        harness_session_id: "session-12345678",
        id: "terminal-1",
        label: "Codex · Session 1",
        last_active_at: "2026-03-20T12:00:00.000Z",
        launch_type: "harness",
        started_at: "2026-03-20T12:00:00.000Z",
        status: "active",
        workspace_id: "ws-1",
      },
      workspace_id: "ws-1",
    };

    expect(getInvalidationTargetsForLifecycleEvent(event)).toEqual([
      { kind: "exact", key: workspaceKeys.activity("ws-1") },
      { kind: "exact", key: terminalKeys.byWorkspace("ws-1") },
    ]);
  });

  test("targets git fact queries without broadening to other workspaces", () => {
    const event: LifecycleEvent = {
      ahead: 1,
      behind: 0,
      branch: "feature/invalidation",
      head_sha: "abcdef1234567890",
      id: "event-1",
      kind: "git.head_changed",
      occurred_at: "2026-03-20T12:00:00.000Z",
      upstream: "origin/feature/invalidation",
      workspace_id: "ws-1",
    };

    expect(getInvalidationTargetsForLifecycleEvent(event)).toEqual([
      { kind: "exact", key: workspaceKeys.byProject() },
      { kind: "exact", key: workspaceKeys.detail("ws-1") },
      { kind: "exact", key: workspaceKeys.activity("ws-1") },
      { kind: "exact", key: gitKeys.status("ws-1") },
      { kind: "prefix", prefix: ["workspace-git-log", "ws-1"] },
      { kind: "exact", key: gitKeys.pullRequests("ws-1") },
      { kind: "exact", key: gitKeys.currentPullRequest("ws-1") },
      { kind: "prefix", prefix: ["workspace-git-pull-request", "ws-1"] },
    ]);
  });
});

describe("invalidateQueriesForLifecycleEvent", () => {
  test("refetches only queries targeted by the lifecycle invalidation table", async () => {
    const client = new QueryClient({} as QuerySource);

    let matchingFetchCount = 0;
    let nonMatchingFetchCount = 0;
    const matchingDescriptor: QueryDescriptor<number> = {
      key: gitKeys.log("ws-1", 50),
      async fetch() {
        matchingFetchCount += 1;
        return matchingFetchCount;
      },
    };
    const nonMatchingDescriptor: QueryDescriptor<number> = {
      key: gitKeys.log("ws-2", 50),
      async fetch() {
        nonMatchingFetchCount += 1;
        return nonMatchingFetchCount;
      },
    };

    const unsubscribeMatching = client.subscribe(matchingDescriptor, () => {});
    const unsubscribeNonMatching = client.subscribe(nonMatchingDescriptor, () => {});
    await flush();

    invalidateQueriesForLifecycleEvent(client, {
      branch: "feature/invalidation",
      head_sha: "abcdef1234567890",
      id: "event-1",
      kind: "git.log_changed",
      occurred_at: "2026-03-20T12:00:00.000Z",
      workspace_id: "ws-1",
    });
    await flush();

    expect(client.getSnapshot(matchingDescriptor).data).toBe(2);
    expect(client.getSnapshot(nonMatchingDescriptor).data).toBe(1);

    unsubscribeMatching();
    unsubscribeNonMatching();
    client.dispose();
  });
});

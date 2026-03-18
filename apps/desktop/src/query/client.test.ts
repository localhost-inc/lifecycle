import { afterEach, describe, expect, test } from "bun:test";
import type { LifecycleEvent, LifecycleEventKind, TerminalRecord } from "@lifecycle/contracts";
import { QueryClient, type LifecycleEventSubscriber, type QueryDescriptor } from "./client";
import type { QuerySource } from "./source";

function createMockSubscriber() {
  let listener: ((event: LifecycleEvent) => void) | null = null;
  let activeTypes: readonly LifecycleEventKind[] = [];

  const subscribe: LifecycleEventSubscriber = async (types, next) => {
    activeTypes = [...types];
    listener = next;
    return () => {
      activeTypes = [];
      listener = null;
    };
  };

  return {
    emit(event: LifecycleEvent) {
      listener?.(event);
    },
    getActiveTypes(): readonly LifecycleEventKind[] {
      return activeTypes;
    },
    subscribe,
  };
}

function createMockSource() {
  const source: QuerySource = {
    async getWorkspace() {
      return null;
    },
    async getWorkspaceSnapshot() {
      return {
        services: [],
        terminals: [],
        workspace: null,
      };
    },
    async getWorkspaceRuntimeProjection() {
      return {
        activity: [],
        environmentTasks: [],
        serviceLogs: [],
        setup: [],
      };
    },
    async getWorkspaceFile() {
      return {
        absolute_path: "/tmp/workspace/README.md",
        byte_len: 0,
        content: "",
        extension: "md",
        file_path: "README.md",
        is_binary: false,
        is_too_large: false,
      };
    },
    async listWorkspaceFiles() {
      return [];
    },
    async getTerminal() {
      return null;
    },
    async getWorkspaceServices() {
      return [];
    },
    async getWorkspaceGitLog() {
      return [];
    },
    async getWorkspaceGitPullRequests() {
      return {
        support: {
          available: false,
          message: "Pull requests unavailable in test mock.",
          provider: null,
          reason: "mode_not_supported",
        },
        pullRequests: [],
      };
    },
    async getWorkspaceGitPullRequest() {
      return {
        support: {
          available: false,
          message: "Pull requests unavailable in test mock.",
          provider: null,
          reason: "mode_not_supported",
        },
        pullRequest: null,
      };
    },
    async getWorkspaceCurrentGitPullRequest() {
      return {
        support: {
          available: false,
          message: "Pull requests unavailable in test mock.",
          provider: null,
          reason: "mode_not_supported",
        },
        branch: null,
        hasPullRequestChanges: null,
        upstream: null,
        suggestedBaseRef: null,
        pullRequest: null,
      };
    },
    async getWorkspaceGitStatus() {
      return {
        ahead: 0,
        behind: 0,
        branch: null,
        files: [],
        headSha: null,
        upstream: null,
      };
    },
    async listWorkspaceTerminals() {
      return [] satisfies TerminalRecord[];
    },
    async listProjects() {
      return [];
    },
    async listWorkspacesByProject() {
      return {};
    },
    async readManifest() {
      return { state: "missing" } as const;
    },
  };

  return source;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("QueryClient", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const dispose of cleanup.splice(0)) {
      dispose();
    }
  });

  test("fetches query data and applies reducer patches from events", async () => {
    const source = createMockSource();
    const subscriber = createMockSubscriber();
    const client = new QueryClient(source, subscriber.subscribe);
    cleanup.push(() => client.dispose());

    const descriptor: QueryDescriptor<{ id: string; status: string }> = {
      eventKinds: ["workspace.status_changed"],
      key: ["workspace", "ws-1"],
      async fetch() {
        return { id: "ws-1", status: "idle" };
      },
      reduce(current, event) {
        if (
          event.kind !== "workspace.status_changed" ||
          event.workspace_id !== "ws-1" ||
          !current
        ) {
          return { kind: "none" };
        }

        return {
          kind: "replace",
          data: {
            ...current,
            status: event.status,
          },
        };
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(unsubscribe);
    await flush();

    expect(client.getSnapshot(descriptor)).toEqual({
      data: { id: "ws-1", status: "idle" },
      error: null,
      status: "ready",
    });

    subscriber.emit({
      id: "evt-1",
      occurred_at: "2026-03-09T00:00:00Z",
      kind: "workspace.status_changed",
      failure_reason: null,
      status: "active",
      workspace_id: "ws-1",
    });

    expect(client.getSnapshot(descriptor)).toEqual({
      data: { id: "ws-1", status: "active" },
      error: null,
      status: "ready",
    });
  });

  test("can prime query data before subscribers fetch", () => {
    const source = createMockSource();
    const subscriber = createMockSubscriber();
    const client = new QueryClient(source, subscriber.subscribe);
    cleanup.push(() => client.dispose());

    const descriptor: QueryDescriptor<{ id: string; status: string }> = {
      key: ["workspace", "ws-1"],
      async fetch() {
        return { id: "ws-1", status: "idle" };
      },
    };

    client.setData(descriptor, { id: "ws-1", status: "active" });

    expect(client.getSnapshot(descriptor)).toEqual({
      data: { id: "ws-1", status: "active" },
      error: null,
      status: "ready",
    });
  });

  test("refetches subscribed queries when reducers invalidate them", async () => {
    const source = createMockSource();
    const subscriber = createMockSubscriber();
    const client = new QueryClient(source, subscriber.subscribe);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const descriptor: QueryDescriptor<number> = {
      eventKinds: ["service.status_changed"],
      key: ["workspace-services", "ws-1"],
      async fetch() {
        fetchCount += 1;
        return fetchCount;
      },
      reduce(_current, event) {
        if (event.kind === "service.status_changed") {
          return { kind: "invalidate" };
        }
        return { kind: "none" };
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(unsubscribe);
    await flush();

    expect(client.getSnapshot(descriptor).data).toBe(1);

    subscriber.emit({
      id: "evt-2",
      occurred_at: "2026-03-09T00:00:00Z",
      kind: "service.status_changed",
      service_name: "web",
      status: "ready",
      status_reason: null,
      workspace_id: "ws-1",
    });
    await flush();

    expect(client.getSnapshot(descriptor).data).toBe(2);
  });

  test("refetches git queries when git fact events invalidate them", async () => {
    const source = createMockSource();
    const subscriber = createMockSubscriber();
    const client = new QueryClient(source, subscriber.subscribe);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const descriptor: QueryDescriptor<number> = {
      eventKinds: ["git.head_changed", "git.status_changed"],
      key: ["workspace-git-status", "ws-1"],
      async fetch() {
        fetchCount += 1;
        return fetchCount;
      },
      reduce(_current, event) {
        if (
          (event.kind === "git.head_changed" || event.kind === "git.status_changed") &&
          event.workspace_id === "ws-1"
        ) {
          return { kind: "invalidate" };
        }

        return { kind: "none" };
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(unsubscribe);
    await flush();

    expect(client.getSnapshot(descriptor).data).toBe(1);

    subscriber.emit({
      id: "evt-3",
      occurred_at: "2026-03-10T00:00:00Z",
      kind: "git.status_changed",
      workspace_id: "ws-1",
      branch: "feature/git-events",
      head_sha: "abcdef1234567890",
      upstream: "origin/feature/git-events",
    });
    await flush();

    expect(client.getSnapshot(descriptor).data).toBe(2);

    subscriber.emit({
      id: "evt-4",
      occurred_at: "2026-03-10T00:00:00Z",
      kind: "git.head_changed",
      workspace_id: "ws-2",
      branch: "other",
      head_sha: "fedcba0987654321",
      upstream: "origin/other",
      ahead: 0,
      behind: 0,
    });
    await flush();

    expect(client.getSnapshot(descriptor).data).toBe(2);
  });

  test("subscribes only to the active query event types", async () => {
    const source = createMockSource();
    const subscriber = createMockSubscriber();
    const client = new QueryClient(source, subscriber.subscribe);
    cleanup.push(() => client.dispose());

    const workspaceDescriptor: QueryDescriptor<number> = {
      eventKinds: ["workspace.status_changed"],
      key: ["workspace", "ws-1"],
      async fetch() {
        return 1;
      },
      reduce() {
        return { kind: "none" };
      },
    };
    const serviceDescriptor: QueryDescriptor<number> = {
      eventKinds: ["service.status_changed"],
      key: ["workspace-services", "ws-1"],
      async fetch() {
        return 1;
      },
      reduce() {
        return { kind: "none" };
      },
    };

    const unsubscribeWorkspace = client.subscribe(workspaceDescriptor, () => {});
    cleanup.push(unsubscribeWorkspace);
    await flush();

    expect(subscriber.getActiveTypes()).toEqual(["workspace.status_changed"]);

    const unsubscribeService = client.subscribe(serviceDescriptor, () => {});
    cleanup.push(unsubscribeService);
    await flush();

    expect(subscriber.getActiveTypes()).toEqual([
      "service.status_changed",
      "workspace.status_changed",
    ]);

    unsubscribeService();
    await flush();

    expect(subscriber.getActiveTypes()).toEqual(["workspace.status_changed"]);
  });
});

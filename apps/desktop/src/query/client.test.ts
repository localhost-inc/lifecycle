import { afterEach, describe, expect, test } from "bun:test";
import type { TerminalRecord } from "@lifecycle/contracts";
import { QueryClient, type QueryDescriptor } from "@/query/client";
import type { QuerySource } from "@/query/source";

function createMockSource() {
  const source: QuerySource = {
    async getWorkspace() {
      return null;
    },
    async getWorkspaceEnvironment() {
      return {
        workspace_id: "ws-1",
        status: "idle",
        failure_reason: null,
        failed_at: null,
        created_at: "2026-03-09T00:00:00Z",
        updated_at: "2026-03-09T00:00:00Z",
      };
    },
    async getWorkspaceActivity() {
      return [];
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
    async getWorkspaceServiceLogs() {
      return [];
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

  test("fetches query data and refetches subscribed queries when invalidated", async () => {
    const source = createMockSource();
    const client = new QueryClient(source);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const descriptor: QueryDescriptor<{ id: string; status: string }> = {
      key: ["workspace", "ws-1"],
      async fetch() {
        fetchCount += 1;
        return { id: "ws-1", status: fetchCount === 1 ? "idle" : "running" };
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

    client.invalidate(descriptor.key);
    await flush();

    expect(client.getSnapshot(descriptor)).toEqual({
      data: { id: "ws-1", status: "running" },
      error: null,
      status: "ready",
    });
  });

  test("can prime query data before subscribers fetch", () => {
    const source = createMockSource();
    const client = new QueryClient(source);
    cleanup.push(() => client.dispose());

    const descriptor: QueryDescriptor<{ id: string; status: string }> = {
      key: ["workspace", "ws-1"],
      async fetch() {
        return { id: "ws-1", status: "idle" };
      },
    };

    client.setData(descriptor, { id: "ws-1", status: "running" });

    expect(client.getSnapshot(descriptor)).toEqual({
      data: { id: "ws-1", status: "running" },
      error: null,
      status: "ready",
    });
  });

  test("refetches invalidated cached queries when they subscribe again", async () => {
    const source = createMockSource();
    const client = new QueryClient(source);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const descriptor: QueryDescriptor<number> = {
      key: ["workspace-services", "ws-1"],
      async fetch() {
        fetchCount += 1;
        return fetchCount;
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    await flush();
    unsubscribe();

    client.invalidate(descriptor.key);

    const resubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(resubscribe);
    await flush();

    expect(client.getSnapshot(descriptor)).toEqual({
      data: 2,
      error: null,
      status: "ready",
    });
  });

  test("dedupes overlapping refetch requests for the same query", async () => {
    const source = createMockSource();
    const client = new QueryClient(source);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const pendingFetchResolvers: Array<() => void> = [];
    const descriptor: QueryDescriptor<number> = {
      key: ["workspace", "ws-1"],
      async fetch() {
        fetchCount += 1;
        await new Promise<void>((resolve) => {
          pendingFetchResolvers.push(resolve);
        });
        return fetchCount;
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(unsubscribe);

    expect(fetchCount).toBe(1);

    const firstRefetch = client.refetch(descriptor);
    const secondRefetch = client.refetch(descriptor);

    expect(fetchCount).toBe(1);

    const releaseInitialFetch = pendingFetchResolvers.shift();
    expect(releaseInitialFetch).toBeDefined();
    releaseInitialFetch?.();
    await Promise.all([firstRefetch, secondRefetch]);
    await flush();

    expect(fetchCount).toBe(1);
    expect(client.getSnapshot(descriptor)).toEqual({
      data: 1,
      error: null,
      status: "ready",
    });
  });

  test("keeps ready data visible while invalidation-driven refetch is in flight", async () => {
    const source = createMockSource();
    const client = new QueryClient(source);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const pendingFetchResolvers: Array<() => void> = [];
    const descriptor: QueryDescriptor<number> = {
      key: ["workspace-services", "ws-1"],
      async fetch() {
        fetchCount += 1;
        await new Promise<void>((resolve) => {
          pendingFetchResolvers.push(resolve);
        });
        return fetchCount;
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(unsubscribe);

    const releaseInitialFetch = pendingFetchResolvers.shift();
    expect(releaseInitialFetch).toBeDefined();
    releaseInitialFetch?.();
    await flush();
    await flush();

    expect(client.getSnapshot(descriptor)).toEqual({
      data: 1,
      error: null,
      status: "ready",
    });

    client.invalidate(descriptor.key);

    expect(fetchCount).toBe(2);
    expect(client.getSnapshot(descriptor)).toEqual({
      data: 1,
      error: null,
      status: "ready",
    });

    const releaseRefetch = pendingFetchResolvers.shift();
    expect(releaseRefetch).toBeDefined();
    releaseRefetch?.();
    await flush();

    expect(client.getSnapshot(descriptor)).toEqual({
      data: 2,
      error: null,
      status: "ready",
    });
  });

  test("refetches queries whose keys match an invalidated prefix", async () => {
    const source = createMockSource();
    const client = new QueryClient(source);
    cleanup.push(() => client.dispose());

    let matchingFetchCount = 0;
    let otherFetchCount = 0;
    const matchingDescriptor: QueryDescriptor<number> = {
      key: ["workspace-git-log", "ws-1", 50],
      async fetch() {
        matchingFetchCount += 1;
        return matchingFetchCount;
      },
    };
    const otherDescriptor: QueryDescriptor<number> = {
      key: ["workspace-git-status", "ws-1"],
      async fetch() {
        otherFetchCount += 1;
        return otherFetchCount;
      },
    };

    const unsubscribeMatching = client.subscribe(matchingDescriptor, () => {});
    const unsubscribeOther = client.subscribe(otherDescriptor, () => {});
    cleanup.push(unsubscribeMatching, unsubscribeOther);
    await flush();

    client.invalidatePrefix(["workspace-git-log", "ws-1"]);
    await flush();

    expect(client.getSnapshot(matchingDescriptor).data).toBe(2);
    expect(client.getSnapshot(otherDescriptor).data).toBe(1);
  });

  test("refetches again when invalidation lands during an in-flight fetch", async () => {
    const source = createMockSource();
    const client = new QueryClient(source);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const pendingFetchResolvers: Array<() => void> = [];
    const descriptor: QueryDescriptor<number> = {
      key: ["workspace-environment", "ws-1"],
      async fetch() {
        fetchCount += 1;
        await new Promise<void>((resolve) => {
          pendingFetchResolvers.push(resolve);
        });
        return fetchCount;
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(unsubscribe);

    expect(fetchCount).toBe(1);
    client.invalidate(descriptor.key);

    const releaseInitialFetch = pendingFetchResolvers.shift();
    expect(releaseInitialFetch).toBeDefined();
    releaseInitialFetch?.();
    await flush();
    await flush();

    expect(fetchCount).toBe(2);

    const releaseFollowUpFetch = pendingFetchResolvers.shift();
    expect(releaseFollowUpFetch).toBeDefined();
    releaseFollowUpFetch?.();
    await flush();
    await flush();

    expect(client.getSnapshot(descriptor)).toEqual({
      data: 2,
      error: null,
      status: "ready",
    });
  });
});

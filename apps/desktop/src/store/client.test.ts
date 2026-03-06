import { afterEach, describe, expect, test } from "bun:test";
import { StoreClient, type QueryDescriptor } from "./client";
import type { StoreEvent } from "./events";
import type { StoreSource } from "./source";

function createMockSource() {
  let listener: ((event: StoreEvent) => void) | null = null;

  const source: StoreSource = {
    async getWorkspace() {
      return null;
    },
    async getWorkspaceServices() {
      return [];
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
    async subscribe(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };

  return {
    emit(event: StoreEvent) {
      listener?.(event);
    },
    source,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("StoreClient", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const dispose of cleanup.splice(0)) {
      dispose();
    }
  });

  test("fetches query data and applies reducer patches from events", async () => {
    const mock = createMockSource();
    const client = new StoreClient(mock.source);
    cleanup.push(() => client.dispose());

    const descriptor: QueryDescriptor<{ id: string; status: string }> = {
      key: ["workspace", "ws-1"],
      async fetch() {
        return { id: "ws-1", status: "sleeping" };
      },
      reduce(current, event) {
        if (event.kind !== "workspace-status-changed" || event.workspaceId !== "ws-1" || !current) {
          return { type: "none" };
        }

        return {
          type: "replace",
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
      data: { id: "ws-1", status: "sleeping" },
      error: null,
      status: "ready",
    });

    mock.emit({
      kind: "workspace-status-changed",
      failureReason: null,
      status: "ready",
      workspaceId: "ws-1",
    });

    expect(client.getSnapshot(descriptor)).toEqual({
      data: { id: "ws-1", status: "ready" },
      error: null,
      status: "ready",
    });
  });

  test("refetches subscribed queries when reducers invalidate them", async () => {
    const mock = createMockSource();
    const client = new StoreClient(mock.source);
    cleanup.push(() => client.dispose());

    let fetchCount = 0;
    const descriptor: QueryDescriptor<number> = {
      key: ["workspace-services", "ws-1"],
      async fetch() {
        fetchCount += 1;
        return fetchCount;
      },
      reduce(_current, event) {
        if (event.kind === "workspace-service-status-changed") {
          return { type: "invalidate" };
        }
        return { type: "none" };
      },
    };

    const unsubscribe = client.subscribe(descriptor, () => {});
    cleanup.push(unsubscribe);
    await flush();

    expect(client.getSnapshot(descriptor).data).toBe(1);

    mock.emit({
      kind: "workspace-service-status-changed",
      serviceName: "web",
      status: "ready",
      statusReason: null,
      workspaceId: "ws-1",
    });
    await flush();

    expect(client.getSnapshot(descriptor).data).toBe(2);
  });
});

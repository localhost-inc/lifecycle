import { describe, expect, test } from "bun:test";
import { createBridgeCollection, createFetchBridgeTransport } from "./collection";

interface TestRecord {
  id: string;
  name: string;
}

async function waitForReady(predicate: () => boolean): Promise<void> {
  const timeoutAt = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > timeoutAt) {
      throw new Error("Timed out waiting for collection readiness.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("createBridgeCollection", () => {
  test("persists insert, update, and delete through bridge mutation handlers", async () => {
    let rows: TestRecord[] = [];

    const collection = createBridgeCollection<TestRecord>({
      id: "test-records",
      load: async () => rows,
      getKey: (record) => record.id,
      onInsert: async ({ transaction }) => {
        rows = rows.concat(transaction.mutations.map((mutation) => mutation.modified));
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          rows = rows.map((row) =>
            row.id === mutation.key ? { ...row, ...mutation.changes } : row,
          );
        }
      },
      onDelete: async ({ transaction }) => {
        const deletedKeys = new Set(transaction.mutations.map((mutation) => String(mutation.key)));
        rows = rows.filter((row) => !deletedKeys.has(row.id));
      },
    });

    await waitForReady(() => collection.isReady());

    const insertTransaction = collection.insert({ id: "one", name: "Alpha" });
    await insertTransaction.isPersisted.promise;
    expect(rows).toEqual([{ id: "one", name: "Alpha" }]);
    expect(collection.get("one")).toEqual({ id: "one", name: "Alpha" });

    const updateTransaction = collection.update("one", (draft) => {
      draft.name = "Beta";
    });
    await updateTransaction.isPersisted.promise;
    expect(rows).toEqual([{ id: "one", name: "Beta" }]);
    expect(collection.get("one")).toEqual({ id: "one", name: "Beta" });

    const deleteTransaction = collection.delete("one");
    await deleteTransaction.isPersisted.promise;
    expect(rows).toEqual([]);
    expect(collection.get("one")).toBeUndefined();
  });

  test("keeps refresh for bridge reconciliation", async () => {
    let rows: TestRecord[] = [{ id: "one", name: "Alpha" }];

    const collection = createBridgeCollection<TestRecord>({
      id: "external-refresh",
      load: async () => rows,
      getKey: (record) => record.id,
    });

    await waitForReady(() => collection.isReady());
    expect(collection.get("one")).toEqual({ id: "one", name: "Alpha" });

    rows = [{ id: "two", name: "External" }];
    await collection.utils.refresh();

    expect(collection.get("one")).toBeUndefined();
    expect(collection.get("two")).toEqual({ id: "two", name: "External" });
  });
});

describe("createFetchBridgeTransport", () => {
  test("sends bridge requests as JSON", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Request[] = [];
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push(input instanceof Request ? input : new Request(String(input), init));
      return Response.json({ ok: true });
    }) as typeof fetch;

    try {
      const transport = createFetchBridgeTransport("http://127.0.0.1:7357/");
      await transport.request<{ ok: boolean }, { name: string }>({
        method: "POST",
        path: "/repos",
        query: { local: true },
        body: { name: "repo" },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("http://127.0.0.1:7357/repos?local=true");
      expect(calls[0]!.method).toBe("POST");
      expect(calls[0]!.headers.get("content-type")).toBe("application/json");
      expect(await calls[0]!.json()).toEqual({ name: "repo" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

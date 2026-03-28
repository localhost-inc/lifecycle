import { describe, expect, test } from "bun:test";
import type { SqlDriver } from "@lifecycle/db";
import { createSqlCollection } from "./collection";

interface TestRecord {
  id: string;
  name: string;
}

function createDriver(): SqlDriver {
  return {
    select: async () => [],
    execute: async () => ({ rowsAffected: 1 }),
    transaction: async (statements) => ({ rowsAffected: statements.map(() => 1) }),
  };
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

describe("createSqlCollection", () => {
  test("persists insert, update, and delete through TanStack DB mutations", async () => {
    let rows: TestRecord[] = [];

    const collection = createSqlCollection<TestRecord>({
      id: "test-records",
      driver: createDriver(),
      loadFn: async () => rows,
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

  test("keeps refresh for out-of-band reconciliation", async () => {
    let rows: TestRecord[] = [{ id: "one", name: "Alpha" }];

    const collection = createSqlCollection<TestRecord>({
      id: "external-refresh",
      driver: createDriver(),
      loadFn: async () => rows,
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

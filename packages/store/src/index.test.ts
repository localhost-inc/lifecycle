import { describe, expect, test } from "bun:test";

describe("@lifecycle/store", () => {
  test("exports collection and query functions", async () => {
    const store = await import("./index");
    expect(typeof store.selectAllRepositories).toBe("function");
    expect(typeof store.createRepositoryCollection).toBe("function");
    expect(typeof store.selectAllWorkspaces).toBe("function");
    expect(typeof store.createWorkspaceCollection).toBe("function");
    expect(typeof store.selectAllServices).toBe("function");
    expect(typeof store.reconcileWorkspaceServices).toBe("function");
    expect(typeof store.selectAgentMessagesByAgent).toBe("function");
    expect(typeof store.upsertAgentMessageWithParts).toBe("function");
    expect(typeof store.insertAgentEvent).toBe("function");
    expect(typeof store.createSqlCollection).toBe("function");
  });
});

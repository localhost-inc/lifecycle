import { describe, expect, test } from "bun:test";

describe("@lifecycle/store", () => {
  test("exports collection and query functions", async () => {
    const store = await import("./index");
    expect(typeof store.selectAllProjects).toBe("function");
    expect(typeof store.createProjectCollection).toBe("function");
    expect(typeof store.selectAllWorkspaces).toBe("function");
    expect(typeof store.createWorkspaceCollection).toBe("function");
    expect(typeof store.selectAllServices).toBe("function");
    expect(typeof store.reconcileWorkspaceServices).toBe("function");
    expect(typeof store.selectAgentMessagesBySession).toBe("function");
    expect(typeof store.upsertAgentMessageWithParts).toBe("function");
    expect(typeof store.insertAgentEvent).toBe("function");
    expect(typeof store.createSqlCollection).toBe("function");
    expect("createAgentSessionCollection" in store).toBe(false);
    expect("insertAgentSession" in store).toBe(false);
    expect("upsertAgentMessage" in store).toBe(false);
    expect("getOrCreateAgentSessionCollection" in store).toBe(false);
    expect("refreshAgentSessionCollection" in store).toBe(false);
    expect("upsertAgentSessionInCollection" in store).toBe(false);
    expect("getOrCreateAgentMessageCollection" in store).toBe(false);
    expect("upsertAgentMessageInCollection" in store).toBe(false);
  });
});

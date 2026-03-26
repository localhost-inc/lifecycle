import { describe, expect, test } from "bun:test";

describe("@lifecycle/store", () => {
  test("exports SqlDriver type and query functions", async () => {
    const store = await import("./index");
    expect(typeof store.selectAllProjects).toBe("function");
    expect(typeof store.createProjectCollection).toBe("function");
    expect(typeof store.selectAllWorkspaces).toBe("function");
    expect(typeof store.createWorkspaceCollection).toBe("function");
    expect(typeof store.selectAllServices).toBe("function");
    expect(typeof store.selectAgentMessagesBySession).toBe("function");
    expect(typeof store.upsertAgentMessage).toBe("function");
    expect(typeof store.upsertAgentMessageWithParts).toBe("function");
    expect(typeof store.insertAgentEvent).toBe("function");
    expect(typeof store.createSqlCollection).toBe("function");
  });
});

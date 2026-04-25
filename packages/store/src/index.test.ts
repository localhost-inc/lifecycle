import { describe, expect, test } from "bun:test";

describe("@lifecycle/store", () => {
  test("exports collection and query functions", async () => {
    const store = await import("./index");
    expect(typeof store.createFetchBridgeTransport).toBe("function");
    expect(typeof store.fetchRepositories).toBe("function");
    expect(typeof store.createRepositoryCollection).toBe("function");
    expect(typeof store.fetchWorkspaceSummaries).toBe("function");
    expect(typeof store.createWorkspaceCollection).toBe("function");
    expect(typeof store.fetchWorkspaceServices).toBe("function");
    expect(typeof store.fetchAgentMessages).toBe("function");
    expect(typeof store.createBridgeCollection).toBe("function");
  });
});

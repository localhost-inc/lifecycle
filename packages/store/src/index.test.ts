import { describe, expect, test } from "bun:test";

describe("@lifecycle/store", () => {
  test("exports SqlDriver type and query functions", async () => {
    const store = await import("./index");
    expect(typeof store.selectAllProjects).toBe("function");
    expect(typeof store.selectAllWorkspaces).toBe("function");
    expect(typeof store.selectAllServices).toBe("function");
    expect(typeof store.selectAllTerminals).toBe("function");
    expect(typeof store.createSqlCollection).toBe("function");
  });
});

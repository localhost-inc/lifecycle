import { describe, expect, test } from "bun:test";
import { LocalStackClient } from "./client";
import { ProcessSupervisor } from "../../supervisor";

describe("LocalStackClient", () => {
  test("constructs with default supervisor when none provided", () => {
    const client = new LocalStackClient();
    expect(client.getSupervisor()).toBeInstanceOf(ProcessSupervisor);
  });

  test("constructs with provided supervisor", () => {
    const supervisor = new ProcessSupervisor();
    const client = new LocalStackClient(supervisor);
    expect(client.getSupervisor()).toBe(supervisor);
  });

  test("stops tracked processes for each named service", async () => {
    const supervisor = new ProcessSupervisor();
    const client = new LocalStackClient(supervisor);

    // Stop should not throw even when no processes are tracked.
    await client.stop("workspace_1", ["web", "api"]);
  });
});

import { describe, expect, test } from "bun:test";
import { createAgentWorkerProviderRegistry } from "@/features/agents/workers";

describe("agent worker provider registry", () => {
  test("resolves worker factories by workspace host", () => {
    const localWorker = (() => Promise.resolve({} as never)) as never;
    const cloudWorker = (() => Promise.resolve({} as never)) as never;
    const registry = createAgentWorkerProviderRegistry({
      cloud: cloudWorker,
      local: localWorker,
    });

    expect(registry.resolve("local")).toBe(localWorker);
    expect(registry.resolve("docker")).toBe(localWorker);
    expect(registry.resolve("cloud")).toBe(cloudWorker);
    expect(() => registry.resolve("remote")).toThrow(
      'No AgentWorker provider is registered for workspace host "remote".',
    );
  });
});

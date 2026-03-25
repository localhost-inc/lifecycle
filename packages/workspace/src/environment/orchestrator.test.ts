import { describe, expect, test } from "bun:test";
import { parseManifest, type LifecycleConfig } from "@lifecycle/contracts";
import {
  EnvironmentOrchestrator,
  type PrepareStartInput,
  type PrepareStartResult,
  type StepInput,
} from "./orchestrator";

function parse(json: string): LifecycleConfig {
  const result = parseManifest(json);
  if (!result.valid)
    throw new Error(result.errors.map((e) => e.message).join(", "));
  return result.config;
}

interface CallLog {
  method: string;
  args: unknown[];
}

function createMockOrchestrator(options?: {
  prepared?: boolean;
  readyServices?: string[];
}): { orchestrator: EnvironmentOrchestrator; calls: CallLog[] } {
  const calls: CallLog[] = [];
  const prepared = options?.prepared ?? false;
  const readyServices = new Set(options?.readyServices ?? []);

  class MockOrchestrator extends EnvironmentOrchestrator {
    async prepareStart(input: PrepareStartInput): Promise<PrepareStartResult> {
      calls.push({ method: "prepareStart", args: [input] });
      return { serviceNames: input.serviceNames };
    }
    async runStep(workspaceId: string, step: StepInput): Promise<void> {
      calls.push({ method: "runStep", args: [workspaceId, step] });
    }
    async startService(workspaceId: string, serviceName: string): Promise<void> {
      calls.push({ method: "startService", args: [workspaceId, serviceName] });
    }
    async stopService(workspaceId: string, serviceName: string): Promise<void> {
      calls.push({ method: "stopService", args: [workspaceId, serviceName] });
    }
    async stopAll(workspaceId: string): Promise<void> {
      calls.push({ method: "stopAll", args: [workspaceId] });
    }
    async markPrepared(workspaceId: string): Promise<void> {
      calls.push({ method: "markPrepared", args: [workspaceId] });
    }
    async getReadyServices(): Promise<Set<string>> {
      return readyServices;
    }
    async isPrepared(): Promise<boolean> {
      return prepared;
    }
  }

  return { orchestrator: new MockOrchestrator(), calls };
}

const BASE_INPUT = {
  workspaceId: "ws-1",
  manifestJson: "",
  manifestFingerprint: "fp-1",
};

describe("EnvironmentOrchestrator", () => {
  test("starts services in dependency order", async () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
        "www": { "kind": "service", "runtime": "process", "command": "bun run www", "depends_on": ["api"] }
      }
    }`);

    const { orchestrator, calls } = createMockOrchestrator();
    await orchestrator.start(config, { ...BASE_INPUT, manifestJson: "" });

    const startCalls = calls
      .filter((c) => c.method === "startService")
      .map((c) => c.args[1]);

    expect(startCalls).toEqual(["api", "www"]);
  });

  test("runs prepare steps before services", async () => {
    const config = parse(`{
      "workspace": {
        "prepare": [
          { "name": "install", "command": "bun install", "timeout_seconds": 60 }
        ]
      },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" }
      }
    }`);

    const { orchestrator, calls } = createMockOrchestrator();
    await orchestrator.start(config, BASE_INPUT);

    const methods = calls.map((c) => c.method);
    const prepareIdx = methods.indexOf("runStep");
    const startIdx = methods.indexOf("startService");

    expect(prepareIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(prepareIdx);
  });

  test("runs tasks in dependency order with services", async () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16" },
        "migrate": {
          "kind": "task",
          "command": "bun run db:migrate",
          "depends_on": ["postgres"],
          "timeout_seconds": 60
        },
        "api": {
          "kind": "service",
          "runtime": "process",
          "command": "bun run api",
          "depends_on": ["migrate"]
        }
      }
    }`);

    const { orchestrator, calls } = createMockOrchestrator();
    await orchestrator.start(config, BASE_INPUT);

    const ordered = calls
      .filter((c) => c.method === "startService" || c.method === "runStep")
      .map((c) =>
        c.method === "startService"
          ? `start:${c.args[1]}`
          : `step:${(c.args[1] as StepInput).name}`,
      );

    expect(ordered).toEqual([
      "start:postgres",
      "step:migrate",
      "start:api",
    ]);
  });

  test("calls prepareStart with service names before execution", async () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
        "www": { "kind": "service", "runtime": "process", "command": "bun run www" }
      }
    }`);

    const { orchestrator, calls } = createMockOrchestrator();
    await orchestrator.start(config, BASE_INPUT);

    const prepareCall = calls.find((c) => c.method === "prepareStart");
    expect(prepareCall).toBeDefined();
    const input = prepareCall!.args[0] as PrepareStartInput;
    expect(input.serviceNames.sort()).toEqual(["api", "www"]);
  });

  test("marks prepared after first successful start with prepare steps", async () => {
    const config = parse(`{
      "workspace": {
        "prepare": [
          { "name": "install", "command": "bun install", "timeout_seconds": 60 }
        ]
      },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" }
      }
    }`);

    const { orchestrator, calls } = createMockOrchestrator({ prepared: false });
    await orchestrator.start(config, BASE_INPUT);

    const markCalls = calls.filter((c) => c.method === "markPrepared");
    expect(markCalls).toHaveLength(1);
  });

  test("does not mark prepared when already prepared", async () => {
    const config = parse(`{
      "workspace": {
        "prepare": [
          { "name": "install", "command": "bun install", "timeout_seconds": 60 }
        ]
      },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" }
      }
    }`);

    const { orchestrator, calls } = createMockOrchestrator({ prepared: true });
    await orchestrator.start(config, BASE_INPUT);

    const markCalls = calls.filter((c) => c.method === "markPrepared");
    expect(markCalls).toHaveLength(0);
  });

  test("skips already-running services in incremental start", async () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
        "www": { "kind": "service", "runtime": "process", "command": "bun run www", "depends_on": ["api"] }
      }
    }`);

    const { orchestrator, calls } = createMockOrchestrator({
      prepared: true,
      readyServices: ["api"],
    });
    await orchestrator.start(config, {
      ...BASE_INPUT,
      serviceNames: ["www"],
    });

    const startCalls = calls
      .filter((c) => c.method === "startService")
      .map((c) => c.args[1]);

    expect(startCalls).toEqual(["www"]);
  });

  test("stop delegates to stopAll", async () => {
    const { orchestrator, calls } = createMockOrchestrator();
    await orchestrator.stop("ws-1");

    expect(calls).toEqual([{ method: "stopAll", args: ["ws-1"] }]);
  });

  test("no-ops when graph produces nothing to do", async () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {}
    }`);

    const { orchestrator, calls } = createMockOrchestrator();
    await orchestrator.start(config, BASE_INPUT);

    expect(calls).toHaveLength(0);
  });
});

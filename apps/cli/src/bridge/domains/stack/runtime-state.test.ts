import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  clearStackRuntimeServices,
  readStackRuntimeState,
  stackRuntimeStatePath,
  upsertStackRuntimeService,
} from "./runtime-state";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
  delete process.env.LIFECYCLE_ROOT;
});

describe("stack runtime state", () => {
  test("persists runtime services under the lifecycle root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-stack-runtime-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    await upsertStackRuntimeService("workspace_1", {
      assigned_port: 43123,
      created_at: "2026-04-07T10:00:00.000Z",
      name: "api",
      pid: 12345,
      runtime: "process",
      status: "ready",
      status_reason: null,
      updated_at: "2026-04-07T10:01:00.000Z",
    });

    const state = await readStackRuntimeState("workspace_1");

    expect(stackRuntimeStatePath("workspace_1")).toBe(join(dir, "stack-runtime", "workspace_1.json"));
    expect(state.services.api).toEqual({
      assigned_port: 43123,
      created_at: "2026-04-07T10:00:00.000Z",
      name: "api",
      pid: 12345,
      runtime: "process",
      status: "ready",
      status_reason: null,
      updated_at: "2026-04-07T10:01:00.000Z",
    });
  });

  test("removes the runtime snapshot when the last targeted service is cleared", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-stack-runtime-clear-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    await upsertStackRuntimeService("workspace_1", {
      assigned_port: 43123,
      created_at: "2026-04-07T10:00:00.000Z",
      name: "api",
      pid: 12345,
      runtime: "process",
      status: "ready",
      status_reason: null,
      updated_at: "2026-04-07T10:01:00.000Z",
    });

    await clearStackRuntimeServices("workspace_1", ["api"]);

    expect(await readStackRuntimeState("workspace_1")).toEqual({
      services: {},
      stack_id: "workspace_1",
    });
  });
});

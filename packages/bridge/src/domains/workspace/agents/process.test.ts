import { describe, expect, test } from "bun:test";
import { basename } from "node:path";

import { resolveAgentWorkerEntrypoint } from "./process";

describe("resolveAgentWorkerEntrypoint", () => {
  test("resolves the dedicated bridge worker entrypoint", () => {
    const entrypoint = resolveAgentWorkerEntrypoint();

    expect(entrypoint.binary).toBe(process.execPath);
    expect(entrypoint.argsPrefix).toHaveLength(1);

    const workerPath = entrypoint.argsPrefix[0];
    expect(workerPath).toBeString();
    expect(basename(workerPath ?? "")).toMatch(/^worker\.(ts|js)$/);
    expect(workerPath).not.toBe(process.argv[1]);
  });
});

import { describe, expect, test } from "bun:test";

import type { WorkspaceProvider } from "./provider";

describe("workspace provider interface", () => {
  test("defines the expected lifecycle method names", () => {
    const requiredMethods: Array<keyof WorkspaceProvider> = [
      "createWorkspace",
      "startServices",
      "healthCheck",
      "stopServices",
      "runSetup",
      "sleep",
      "wake",
      "destroy",
      "openTerminal",
      "exposePort",
    ];

    expect(requiredMethods).toHaveLength(10);
  });
});

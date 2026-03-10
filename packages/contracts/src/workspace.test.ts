import { describe, expect, test } from "bun:test";

import type { WorkspaceMode, WorkspaceServicePreviewStatus, WorkspaceStatus } from "./workspace";

describe("workspace contracts", () => {
  test("keeps canonical mode values", () => {
    const modes: WorkspaceMode[] = ["local", "cloud"];
    expect(modes).toEqual(["local", "cloud"]);
  });

  test("contains active status", () => {
    const status: WorkspaceStatus = "active";
    expect(status).toBe("active");
  });

  test("contains preview ready state", () => {
    const previewState: WorkspaceServicePreviewStatus = "ready";
    expect(previewState).toBe("ready");
  });
});

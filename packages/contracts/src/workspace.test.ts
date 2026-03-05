import { describe, expect, test } from "bun:test";

import type { WorkspaceMode, WorkspaceServicePreviewState, WorkspaceStatus } from "./workspace";

describe("workspace contracts", () => {
  test("keeps canonical mode values", () => {
    const modes: WorkspaceMode[] = ["local", "cloud"];
    expect(modes).toEqual(["local", "cloud"]);
  });

  test("contains ready status", () => {
    const status: WorkspaceStatus = "ready";
    expect(status).toBe("ready");
  });

  test("contains preview ready state", () => {
    const previewState: WorkspaceServicePreviewState = "ready";
    expect(previewState).toBe("ready");
  });
});

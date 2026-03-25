import { describe, expect, test } from "bun:test";
import { shouldAutoCreateDefaultWorkspaceTab } from "@/features/workspaces/canvas/workspace-canvas-controller";

describe("shouldAutoCreateDefaultWorkspaceTab", () => {
  test("only auto-creates when the workspace has no tabs", () => {
    expect(shouldAutoCreateDefaultWorkspaceTab({ tabCount: 0 })).toBeTrue();
    expect(shouldAutoCreateDefaultWorkspaceTab({ tabCount: 1 })).toBeFalse();
  });
});

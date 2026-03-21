import { describe, expect, test } from "bun:test";
import {
  canInlineRenameWorkspace,
  getWorkspaceDisplayName,
  isRootWorkspace,
} from "@/features/workspaces/lib/workspace-display";

describe("workspace display", () => {
  test("keeps worktree workspace names as the primary display label", () => {
    expect(
      getWorkspaceDisplayName({
        checkout_type: "worktree",
        name: "Auth Flow Fix",
        source_ref: "lifecycle/auth-flow-fix",
      }),
    ).toBe("Auth Flow Fix");
  });

  test("uses the live branch name for root workspaces when available", () => {
    expect(
      getWorkspaceDisplayName(
        {
          checkout_type: "root",
          name: "Root",
          source_ref: "main",
        },
        "feature/live-branch",
      ),
    ).toBe("feature/live-branch");
  });

  test("falls back to the stored source ref for root workspaces", () => {
    expect(
      getWorkspaceDisplayName({
        checkout_type: "root",
        name: "Root",
        source_ref: "main",
      }),
    ).toBe("main");
  });

  test("recognizes root workspaces as non-renameable in the inline tree UI", () => {
    expect(isRootWorkspace({ checkout_type: "root" })).toBeTrue();
    expect(canInlineRenameWorkspace({ checkout_type: "root" })).toBeFalse();
    expect(canInlineRenameWorkspace({ checkout_type: "worktree" })).toBeTrue();
  });
});

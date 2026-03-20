import { describe, expect, test } from "bun:test";
import {
  canInlineRenameWorkspace,
  getWorkspaceDisplayName,
  isRootWorkspace,
} from "@/features/workspaces/lib/workspace-display";

describe("workspace display", () => {
  test("keeps managed workspace names as the primary display label", () => {
    expect(
      getWorkspaceDisplayName({
        kind: "managed",
        name: "Auth Flow Fix",
        source_ref: "lifecycle/auth-flow-fix",
      }),
    ).toBe("Auth Flow Fix");
  });

  test("uses the live branch name for root workspaces when available", () => {
    expect(
      getWorkspaceDisplayName(
        {
          kind: "root",
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
        kind: "root",
        name: "Root",
        source_ref: "main",
      }),
    ).toBe("main");
  });

  test("recognizes root workspaces as non-renameable in the inline tree UI", () => {
    expect(isRootWorkspace({ kind: "root" })).toBeTrue();
    expect(canInlineRenameWorkspace({ kind: "root" })).toBeFalse();
    expect(canInlineRenameWorkspace({ kind: "managed" })).toBeTrue();
  });
});

import { describe, expect, test } from "bun:test";
import { workspaceSupportsFilesystemInteraction } from "../lib/workspace-capabilities";

describe("workspaceSupportsFilesystemInteraction", () => {
  test("allows terminals once a worktree exists outside create and destroy", () => {
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "sleeping",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "starting",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
  });

  test("rejects workspaces without an interactive filesystem context", () => {
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "creating",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "destroying",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "sleeping",
        worktree_path: null,
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "cloud",
        status: "ready",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeFalse();
  });
});

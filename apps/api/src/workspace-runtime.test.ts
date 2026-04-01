import { describe, expect, test } from "bun:test";

import {
  buildWorkspaceExecCommand,
  CLOUD_WORKTREE_PATH,
} from "./workspace-runtime";

describe("buildWorkspaceExecCommand", () => {
  test("builds an exec command with cwd and environment", () => {
    expect(
      buildWorkspaceExecCommand(["git", "status"], {
        cwd: "/workspace/app",
        env: {
          HOME: "/home/lifecycle",
          TOKEN: "abc'123",
        },
      }),
    ).toBe(
      "export HOME='/home/lifecycle' && export TOKEN='abc'\"'\"'123' && cd '/workspace/app' && exec 'git' 'status'",
    );
  });

  test("rejects invalid environment variable names", () => {
    expect(() =>
      buildWorkspaceExecCommand(["env"], {
        env: {
          "BAD-NAME": "value",
        },
      }),
    ).toThrow("Invalid environment variable name: BAD-NAME");
  });

  test("uses /workspace as the canonical cloud worktree path", () => {
    expect(CLOUD_WORKTREE_PATH).toBe("/workspace");
  });
});

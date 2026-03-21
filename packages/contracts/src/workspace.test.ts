import { describe, expect, test } from "bun:test";

import type {
  WorkspaceCheckoutType,
  WorkspaceStatus,
  WorkspaceTarget,
} from "./workspace";

describe("workspace contracts", () => {
  test("keeps canonical workspace targets", () => {
    const targets: WorkspaceTarget[] = [
      "host",
      "docker",
      "remote_host",
      "cloud",
    ];
    expect(targets).toEqual(["host", "docker", "remote_host", "cloud"]);
  });

  test("keeps canonical workspace checkout types", () => {
    const checkoutTypes: WorkspaceCheckoutType[] = ["root", "worktree"];
    expect(checkoutTypes).toEqual(["root", "worktree"]);
  });

  test("contains active status", () => {
    const status: WorkspaceStatus = "active";
    expect(status).toBe("active");
  });
});

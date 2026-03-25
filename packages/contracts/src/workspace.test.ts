import { describe, expect, test } from "bun:test";

import type {
  WorkspaceCheckoutType,
  WorkspaceStatus,
  WorkspaceTarget,
} from "./workspace";

describe("workspace contracts", () => {
  test("keeps canonical workspace targets", () => {
    const targets: WorkspaceTarget[] = ["local", "docker", "remote", "cloud"];
    expect(targets).toEqual(["local", "docker", "remote", "cloud"]);
  });

  test("keeps canonical workspace checkout types", () => {
    const checkoutTypes: WorkspaceCheckoutType[] = ["root", "worktree"];
    expect(checkoutTypes).toEqual(["root", "worktree"]);
  });

  test("contains canonical workspace statuses", () => {
    const provisioningStatus: WorkspaceStatus = "provisioning";
    const activeStatus: WorkspaceStatus = "active";
    const archivedStatus: WorkspaceStatus = "archived";
    expect(provisioningStatus).toBe("provisioning");
    expect(activeStatus).toBe("active");
    expect(archivedStatus).toBe("archived");
  });

});

import { describe, expect, test } from "bun:test";
import {
  browserWorkspaceSourceRef,
  browserWorktreeDirectoryName,
  shortWorkspaceId,
  slugifyWorkspaceName,
} from "./api";

describe("workspace naming helpers", () => {
  test("preserves human labels while deriving kebab-case managed identifiers", () => {
    const workspaceId = "1234abcd-ffff-eeee-dddd-000000000000";
    const workspaceName = "Fix Auth Callback / API";

    expect(browserWorkspaceSourceRef(workspaceName, workspaceId)).toBe(
      "lifecycle/fix-auth-callback-api-1234abcd",
    );
    expect(browserWorktreeDirectoryName(workspaceName, workspaceId)).toBe(
      "fix-auth-callback-api--1234abcd",
    );
  });

  test("normalizes empty-or-symbol-only names to a stable workspace slug", () => {
    expect(slugifyWorkspaceName("___")).toBe("workspace");
    expect(browserWorkspaceSourceRef("___", "workspace-1")).toBe("lifecycle/workspace-workspac");
  });

  test("derives the short identifier from alphanumeric characters only", () => {
    expect(shortWorkspaceId("ab-12_cd.34")).toBe("ab12cd34");
  });
});

import { describe, expect, test } from "bun:test";
import { formatWorkspaceError } from "@/features/workspaces/lib/workspace-errors";

describe("formatWorkspaceError", () => {
  test("prefers suggested actions for locked workspace mutations", () => {
    expect(
      formatWorkspaceError(
        {
          code: "workspace_mutation_locked",
          message: "Workspace mutation locked while environment status is 'stopping'",
          requestId: "request-1",
          retryable: true,
          suggestedAction:
            "Wait for the current workspace lifecycle action to finish and try again.",
        },
        "Workspace action failed.",
      ),
    ).toBe("Wait for the current workspace lifecycle action to finish and try again.");
  });

  test("falls back to a generic not found message", () => {
    expect(
      formatWorkspaceError(
        {
          code: "not_found",
          message: "Workspace not found: ws_1",
          requestId: "request-2",
          retryable: false,
        },
        "Workspace action failed.",
      ),
    ).toBe("Workspace not found.");
  });

  test("maps startup failures to environment guidance", () => {
    expect(
      formatWorkspaceError(
        {
          code: "service_start_failed",
          message: "Service start failed: web - exited immediately",
          requestId: "request-3",
          retryable: true,
        },
        "Workspace action failed.",
      ),
    ).toBe("A service failed to start. Check the environment logs for details.");
  });
});

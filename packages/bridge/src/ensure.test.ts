import { describe, expect, test } from "bun:test";

import { formatBridgeFailure } from "./ensure";

describe("formatBridgeFailure", () => {
  test("returns structured bridge messages", () => {
    expect(
      formatBridgeFailure(
        400,
        JSON.stringify({
          error: {
            code: "stack_unconfigured",
            message: "Workspace has no lifecycle.json.",
          },
        }),
      ),
    ).toBe("Workspace has no lifecycle.json.");
  });

  test("returns validation issue details", () => {
    expect(
      formatBridgeFailure(
        400,
        JSON.stringify({
          error: "Validation failed",
          target: "body",
          issues: [
            { message: "Required", path: ["repoPath"] },
            {
              message: "Too small: expected string to have >=1 characters",
              path: ["worktreePath"],
            },
          ],
        }),
      ),
    ).toBe(
      "Bridge body validation failed: repoPath: Required; worktreePath: Too small: expected string to have >=1 characters",
    );
  });

  test("includes status for raw body failures", () => {
    expect(formatBridgeFailure(500, "upstream exploded")).toBe(
      "Bridge request failed with status 500: upstream exploded",
    );
  });
});

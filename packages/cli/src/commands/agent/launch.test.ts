import { describe, expect, test } from "bun:test";

import { buildProviderLaunchCommand, buildSessionName } from "./launch";

describe("buildProviderLaunchCommand", () => {
  test("boots Claude through the shell profile launcher", () => {
    expect(buildProviderLaunchCommand("claude")).toBe(
      "lifecycle_launch_claude",
    );
  });

  test("boots Codex through the shell profile launcher", () => {
    expect(buildProviderLaunchCommand("codex")).toBe(
      "lifecycle_launch_codex",
    );
  });
});

describe("buildSessionName", () => {
  test("prefixes provider with agent-", () => {
    expect(buildSessionName("codex")).toBe("agent-codex");
    expect(buildSessionName("claude")).toBe("agent-claude");
  });
});

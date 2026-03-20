import { describe, expect, test } from "bun:test";

import type {
  EnvironmentStatus,
  WorkspaceKind,
  WorkspaceMode,
} from "./workspace";

describe("workspace contracts", () => {
  test("keeps canonical mode values", () => {
    const modes: WorkspaceMode[] = ["local", "cloud"];
    expect(modes).toEqual(["local", "cloud"]);
  });

  test("keeps canonical workspace kinds", () => {
    const kinds: WorkspaceKind[] = ["root", "managed"];
    expect(kinds).toEqual(["root", "managed"]);
  });

  test("contains running status", () => {
    const status: EnvironmentStatus = "running";
    expect(status).toBe("running");
  });
});

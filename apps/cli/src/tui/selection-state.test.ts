import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadWorkspaceSelection,
  saveWorkspaceSelection,
  selectionStatePath,
} from "./selection-state";

describe("tui selection state", () => {
  test("reads and writes the persisted workspace selection", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "lifecycle-cli-tui-selection-"));
    try {
      expect(await loadWorkspaceSelection(homeDir)).toBeNull();

      await saveWorkspaceSelection("ws_123", homeDir);

      expect(await loadWorkspaceSelection(homeDir)).toBe("ws_123");
      expect(await readFile(selectionStatePath(homeDir), "utf8")).toContain('"workspace_id": "ws_123"');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test("persists a null selection for empty values", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "lifecycle-cli-tui-selection-"));
    try {
      await saveWorkspaceSelection("   ", homeDir);
      expect(await loadWorkspaceSelection(homeDir)).toBeNull();
      expect(await readFile(selectionStatePath(homeDir), "utf8")).toContain('"workspace_id": null');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});

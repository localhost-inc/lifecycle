import { describe, expect, test } from "bun:test";
import {
  createTerminal,
  detachTerminal,
  interruptTerminal,
  killTerminal,
  listWorkspaceTerminals,
  renameTerminal,
  saveTerminalAttachment,
  terminalHasLiveSession,
} from "@/features/terminals/api";

const TERMINAL_ACCESS_UNAVAILABLE_MESSAGE = "Terminal access requires the Tauri desktop shell.";

async function expectTerminalAccessError(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error("Expected terminal access error.");
  } catch (error) {
    expect(String(error)).toContain(TERMINAL_ACCESS_UNAVAILABLE_MESSAGE);
  }
}

describe("terminal api", () => {
  test("identifies attachable terminal statuses", () => {
    expect(terminalHasLiveSession("active")).toBeTrue();
    expect(terminalHasLiveSession("detached")).toBeTrue();
    expect(terminalHasLiveSession("sleeping")).toBeTrue();
    expect(terminalHasLiveSession("failed")).toBeFalse();
    expect(terminalHasLiveSession("finished")).toBeFalse();
  });

  test("returns empty terminal state outside tauri", async () => {
    expect(await listWorkspaceTerminals("workspace_1")).toEqual([]);
  });

  test("requires tauri for terminal mutations", async () => {
    await expectTerminalAccessError(
      createTerminal({
        launchType: "shell",
        workspaceId: "workspace_1",
      }),
    );
    await expectTerminalAccessError(detachTerminal("workspace_1", "terminal_1"));
    await expectTerminalAccessError(killTerminal("workspace_1", "terminal_1"));
    await expectTerminalAccessError(interruptTerminal("workspace_1", "terminal_1"));
    await expect(
      saveTerminalAttachment({
        base64Data: "ZmFrZQ==",
        fileName: "screenshot.png",
        workspaceId: "workspace_1",
      }),
    ).rejects.toThrow("Image paste and drop are only available in the desktop app.");
  });

  test("normalizes labels before checking terminal access support", async () => {
    await expectTerminalAccessError(
      renameTerminal("workspace_1", "terminal_1", "  Codex   Session  "),
    );
  });

  test("rejects empty labels before runtime checks", async () => {
    try {
      await renameTerminal("workspace_1", "terminal_1", "   ");
      throw new Error("Expected empty label validation error.");
    } catch (error) {
      expect(String(error)).toContain("Session title cannot be empty.");
    }
  });
});

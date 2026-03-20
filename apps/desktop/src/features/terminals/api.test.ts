import { describe, expect, test } from "bun:test";
import {
  createTerminal,
  detachTerminal,
  getTerminal,
  interruptTerminal,
  killTerminal,
  listWorkspaceTerminals,
  renameTerminal,
  saveTerminalAttachment,
  terminalHasLiveSession,
} from "@/features/terminals/api";

const TERMINAL_RUNTIME_UNAVAILABLE_MESSAGE = "Terminal runtime requires the Tauri desktop shell.";

async function expectTerminalRuntimeError(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error("Expected terminal runtime error.");
  } catch (error) {
    expect(String(error)).toContain(TERMINAL_RUNTIME_UNAVAILABLE_MESSAGE);
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
    expect(await getTerminal("terminal_1")).toBeNull();
  });

  test("requires tauri for terminal runtime mutations", async () => {
    await expectTerminalRuntimeError(
      createTerminal({
        launchType: "shell",
        workspaceId: "workspace_1",
      }),
    );
    await expectTerminalRuntimeError(detachTerminal("terminal_1"));
    await expectTerminalRuntimeError(killTerminal("terminal_1"));
    await expectTerminalRuntimeError(interruptTerminal("terminal_1"));
    await expect(
      saveTerminalAttachment({
        base64Data: "ZmFrZQ==",
        fileName: "screenshot.png",
        workspaceId: "workspace_1",
      }),
    ).rejects.toThrow("Image paste and drop are only available in the desktop app.");
  });

  test("normalizes labels before checking runtime support", async () => {
    await expectTerminalRuntimeError(renameTerminal("terminal_1", "  Codex   Session  "));
  });

  test("rejects empty labels before runtime checks", async () => {
    try {
      await renameTerminal("terminal_1", "   ");
      throw new Error("Expected empty label validation error.");
    } catch (error) {
      expect(String(error)).toContain("Session title cannot be empty.");
    }
  });
});

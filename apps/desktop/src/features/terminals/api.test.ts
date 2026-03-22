import { describe, expect, test } from "bun:test";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
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

// Dummy runtime for non-Tauri tests (won't be called because isTauri is false)
const runtime = {} as WorkspaceRuntime;

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
    expect(await listWorkspaceTerminals(runtime, "workspace_1")).toEqual([]);
  });

  test("requires tauri for terminal mutations", async () => {
    await expectTerminalAccessError(
      createTerminal(runtime, {
        launchType: "shell",
        workspaceId: "workspace_1",
      }),
    );
    await expectTerminalAccessError(detachTerminal(runtime, "workspace_1", "terminal_1"));
    await expectTerminalAccessError(killTerminal(runtime, "workspace_1", "terminal_1"));
    await expectTerminalAccessError(interruptTerminal(runtime, "workspace_1", "terminal_1"));
    await expect(
      saveTerminalAttachment(runtime, {
        base64Data: "ZmFrZQ==",
        fileName: "screenshot.png",
        workspaceId: "workspace_1",
      }),
    ).rejects.toThrow("Image paste and drop are only available in the desktop app.");
  });

  test("normalizes labels before checking terminal access support", async () => {
    await expectTerminalAccessError(
      renameTerminal(runtime, "workspace_1", "terminal_1", "  Codex   Session  "),
    );
  });

  test("rejects empty labels before runtime checks", async () => {
    try {
      await renameTerminal(runtime, "workspace_1", "terminal_1", "   ");
      throw new Error("Expected empty label validation error.");
    } catch (error) {
      expect(String(error)).toContain("Session title cannot be empty.");
    }
  });
});

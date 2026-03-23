import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { TerminalRecord } from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import {
  createTerminal,
  detachTerminal,
  interruptTerminal,
  killTerminal,
  listWorkspaceTerminals,
  renameTerminal,
  saveTerminalAttachment,
  sendTerminalText,
} from "@/features/terminals/api";

const terminal: TerminalRecord = {
  id: "term_1",
  workspace_id: "ws_1",
  launch_type: "shell",
  created_by: null,
  label: "Terminal 1",
  status: "active",
  failure_reason: null,
  exit_code: null,
  started_at: "2026-03-13T00:00:00.000Z",
  last_active_at: "2026-03-13T00:00:00.000Z",
  ended_at: null,
};

const runtime = {
  listTerminals: mock(async () => [terminal]),
  createTerminal: mock(async () => terminal),
  renameTerminal: mock(async () => ({ ...terminal, label: "Codex Session" })),
  sendTerminalText: mock(async () => {}),
  saveTerminalAttachment: mock(async () => ({
    absolutePath: "/tmp/ws_1/attachments/screenshot.png",
    fileName: "screenshot.png",
    relativePath: ".lifecycle/attachments/screenshot.png",
  })),
  detachTerminal: mock(async () => {}),
  killTerminal: mock(async () => {}),
  interruptTerminal: mock(async () => {}),
} as unknown as WorkspaceRuntime;

describe("terminal api workspace routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    for (const method of Object.values(runtime)) {
      if (typeof method === "function" && "mockClear" in method) {
        (method as ReturnType<typeof mock>).mockClear();
      }
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes terminal lifecycle reads and mutations through the runtime", async () => {
    expect(await listWorkspaceTerminals(runtime, "ws_1")).toEqual([terminal]);
    expect(await createTerminal(runtime, { workspaceId: "ws_1", launchType: "shell" })).toEqual(terminal);
    expect(await renameTerminal(runtime, "ws_1", "term_1", "  Codex   Session  ")).toEqual({
      ...terminal,
      label: "Codex Session",
    });
    expect(
      await saveTerminalAttachment(runtime, {
        base64Data: "ZmFrZQ==",
        fileName: "screenshot.png",
        workspaceId: "ws_1",
      }),
    ).toEqual({
      absolutePath: "/tmp/ws_1/attachments/screenshot.png",
      fileName: "screenshot.png",
      relativePath: ".lifecycle/attachments/screenshot.png",
    });
    await sendTerminalText(runtime, "ws_1", "term_1", "status\n");
    await detachTerminal(runtime, "ws_1", "term_1");
    await killTerminal(runtime, "ws_1", "term_1");
    await interruptTerminal(runtime, "ws_1", "term_1");

    expect((runtime.listTerminals as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((runtime.createTerminal as ReturnType<typeof mock>)).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      launchType: "shell",
    });
    expect((runtime.renameTerminal as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "term_1", "Codex Session");
    expect((runtime.sendTerminalText as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "term_1", "status\n");
    expect((runtime.saveTerminalAttachment as ReturnType<typeof mock>)).toHaveBeenCalledWith({
      base64Data: "ZmFrZQ==",
      fileName: "screenshot.png",
      workspaceId: "ws_1",
    });
    expect((runtime.detachTerminal as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "term_1");
    expect((runtime.killTerminal as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "term_1");
    expect((runtime.interruptTerminal as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "term_1");
  });
});

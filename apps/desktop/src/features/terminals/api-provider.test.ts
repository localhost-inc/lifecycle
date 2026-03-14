import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { TerminalRecord } from "@lifecycle/contracts";

const getWorkspaceProvider = mock(() => provider);

const terminal: TerminalRecord = {
  id: "term_1",
  workspace_id: "ws_1",
  launch_type: "shell",
  harness_provider: null,
  harness_session_id: null,
  created_by: null,
  label: "Terminal 1",
  status: "active",
  failure_reason: null,
  exit_code: null,
  started_at: "2026-03-13T00:00:00.000Z",
  last_active_at: "2026-03-13T00:00:00.000Z",
  ended_at: null,
};

const provider = {
  listWorkspaceTerminals: mock(async () => [terminal]),
  getTerminal: mock(async () => terminal),
  createTerminal: mock(async () => terminal),
  renameTerminal: mock(async () => ({ ...terminal, label: "Codex Session" })),
  saveTerminalAttachment: mock(async () => ({
    absolutePath: "/tmp/ws_1/attachments/screenshot.png",
    fileName: "screenshot.png",
    relativePath: ".lifecycle/attachments/screenshot.png",
  })),
  detachTerminal: mock(async () => {}),
  killTerminal: mock(async () => {}),
};

mock.module("../../lib/workspace-provider", () => ({
  getWorkspaceProvider,
}));

const {
  createTerminal,
  detachTerminal,
  getTerminal,
  killTerminal,
  listWorkspaceTerminals,
  renameTerminal,
  saveTerminalAttachment,
} = await import("./api");

describe("terminal api provider routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getWorkspaceProvider.mockClear();
    for (const method of Object.values(provider)) {
      method.mockClear();
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes terminal lifecycle reads and mutations through the provider", async () => {
    expect(await listWorkspaceTerminals("ws_1")).toEqual([terminal]);
    expect(await getTerminal("term_1")).toEqual(terminal);
    expect(await createTerminal({ workspaceId: "ws_1", launchType: "shell" })).toEqual(terminal);
    expect(await renameTerminal("term_1", "  Codex   Session  ")).toEqual({
      ...terminal,
      label: "Codex Session",
    });
    expect(
      await saveTerminalAttachment({
        base64Data: "ZmFrZQ==",
        fileName: "screenshot.png",
        workspaceId: "ws_1",
      }),
    ).toEqual({
      absolutePath: "/tmp/ws_1/attachments/screenshot.png",
      fileName: "screenshot.png",
      relativePath: ".lifecycle/attachments/screenshot.png",
    });
    await detachTerminal("term_1");
    await killTerminal("term_1");

    expect(getWorkspaceProvider).toHaveBeenCalled();
    expect(provider.listWorkspaceTerminals).toHaveBeenCalledWith("ws_1");
    expect(provider.getTerminal).toHaveBeenCalledWith("term_1");
    expect(provider.createTerminal).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      launchType: "shell",
      harnessProvider: null,
      harnessSessionId: null,
    });
    expect(provider.renameTerminal).toHaveBeenCalledWith("term_1", "Codex Session");
    expect(provider.saveTerminalAttachment).toHaveBeenCalledWith({
      base64Data: "ZmFrZQ==",
      fileName: "screenshot.png",
      workspaceId: "ws_1",
    });
    expect(provider.detachTerminal).toHaveBeenCalledWith("term_1");
    expect(provider.killTerminal).toHaveBeenCalledWith("term_1");
  });
});

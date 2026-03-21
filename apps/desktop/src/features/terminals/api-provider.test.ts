import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { TerminalRecord } from "@lifecycle/contracts";
import {
  buildHarnessLaunchConfig,
  buildDefaultHarnessSettings,
} from "@/features/settings/state/harness-settings";

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

const runtime = {
  listTerminals: mock(async () => [terminal]),
  createTerminal: mock(async () => terminal),
  renameTerminal: mock(async () => ({ ...terminal, label: "Codex Session" })),
  saveTerminalAttachment: mock(async () => ({
    absolutePath: "/tmp/ws_1/attachments/screenshot.png",
    fileName: "screenshot.png",
    relativePath: ".lifecycle/attachments/screenshot.png",
  })),
  detachTerminal: mock(async () => {}),
  killTerminal: mock(async () => {}),
  interruptTerminal: mock(async () => {}),
};

const getRuntime = mock(() => runtime);

mock.module("../../lib/runtime", () => ({
  getRuntime,
}));

const {
  createTerminal,
  detachTerminal,
  interruptTerminal,
  killTerminal,
  listWorkspaceTerminals,
  renameTerminal,
  saveTerminalAttachment,
} = await import("./api");

describe("terminal api runtime routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getRuntime.mockClear();
    for (const method of Object.values(runtime)) {
      method.mockClear();
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes terminal lifecycle reads and mutations through the runtime", async () => {
    expect(await listWorkspaceTerminals("ws_1")).toEqual([terminal]);
    expect(await createTerminal({ workspaceId: "ws_1", launchType: "shell" })).toEqual(terminal);
    expect(
      await createTerminal({
        workspaceId: "ws_1",
        launchType: "harness",
        harnessProvider: "codex",
        harnessLaunchConfig: buildHarnessLaunchConfig("codex", buildDefaultHarnessSettings()),
      }),
    ).toEqual(terminal);
    expect(await renameTerminal("ws_1", "term_1", "  Codex   Session  ")).toEqual({
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
    await detachTerminal("ws_1", "term_1");
    await killTerminal("ws_1", "term_1");
    await interruptTerminal("ws_1", "term_1");

    expect(getRuntime).toHaveBeenCalled();
    expect(runtime.listTerminals).toHaveBeenCalledWith("ws_1");
    expect(runtime.createTerminal).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      launchType: "shell",
      harnessProvider: null,
      harnessSessionId: null,
    });
    expect(runtime.createTerminal).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      launchType: "harness",
      harnessLaunchConfig: {
        approvalPolicy: "untrusted",
        dangerousBypass: false,
        preset: "guarded",
        provider: "codex",
        sandboxMode: "workspace-write",
      },
      harnessProvider: "codex",
      harnessSessionId: null,
    });
    expect(runtime.renameTerminal).toHaveBeenCalledWith("ws_1", "term_1", "Codex Session");
    expect(runtime.saveTerminalAttachment).toHaveBeenCalledWith({
      base64Data: "ZmFrZQ==",
      fileName: "screenshot.png",
      workspaceId: "ws_1",
    });
    expect(runtime.detachTerminal).toHaveBeenCalledWith("ws_1", "term_1");
    expect(runtime.killTerminal).toHaveBeenCalledWith("ws_1", "term_1");
    expect(runtime.interruptTerminal).toHaveBeenCalledWith("ws_1", "term_1");
  });
});

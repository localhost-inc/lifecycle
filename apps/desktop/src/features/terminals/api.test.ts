import { describe, expect, test } from "bun:test";

import { evaluateBrowserTerminalCommand, terminalHasLiveSession } from "./api";

describe("terminal browser simulator", () => {
  test("echoes help output with a prompt", () => {
    const result = evaluateBrowserTerminalCommand("help", {
      harness_provider: null,
      launch_type: "shell",
      workspace_id: "ws_1",
    });

    expect(result.output).toContain("Available commands:");
    expect(result.output).toContain("lifecycle$ ");
  });

  test("finishes the session on exit", () => {
    const result = evaluateBrowserTerminalCommand("exit", {
      harness_provider: "codex",
      launch_type: "harness",
      workspace_id: "ws_1",
    });

    expect(result.finish).toBeTrue();
    expect(result.exitCode).toBe(0);
  });

  test("identifies attachable terminal statuses", () => {
    expect(terminalHasLiveSession("active")).toBeTrue();
    expect(terminalHasLiveSession("detached")).toBeTrue();
    expect(terminalHasLiveSession("sleeping")).toBeTrue();
    expect(terminalHasLiveSession("failed")).toBeFalse();
    expect(terminalHasLiveSession("finished")).toBeFalse();
  });
});

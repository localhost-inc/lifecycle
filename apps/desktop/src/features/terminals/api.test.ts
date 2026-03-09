import { describe, expect, test } from "bun:test";
import { subscribeToLifecycleEvents } from "../events/api";

import {
  attachTerminalStream,
  createTerminal,
  detachTerminal,
  evaluateBrowserTerminalCommand,
  terminalHasLiveSession,
  writeTerminal,
  type TerminalStreamChunk,
} from "./api";

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

  test("reattach only replays unseen browser chunks when given a replay cursor", async () => {
    const terminal = await createTerminal({
      cols: 120,
      launchType: "shell",
      rows: 32,
      workspaceId: `ws_${crypto.randomUUID()}`,
    });

    const initialReplay: TerminalStreamChunk[] = [];
    const disposeInitialReplay = await attachTerminalStream(terminal.id, 120, 32, null, (chunk) => {
      initialReplay.push(chunk);
    });
    expect(initialReplay.length).toBeGreaterThan(0);
    const lastSeenCursor = initialReplay.at(-1)?.cursor ?? null;
    expect(lastSeenCursor).not.toBeNull();

    disposeInitialReplay();
    await detachTerminal(terminal.id);

    const nextReplay: TerminalStreamChunk[] = [];
    const disposeNextReplay = await attachTerminalStream(
      terminal.id,
      120,
      32,
      lastSeenCursor,
      (chunk) => {
        nextReplay.push(chunk);
      },
    );

    expect(nextReplay).toHaveLength(0);

    disposeNextReplay();
    await detachTerminal(terminal.id);
  });

  test("emits a response-ready event for harness turns in the browser simulator", async () => {
    const terminal = await createTerminal({
      cols: 120,
      launchType: "harness",
      harnessProvider: "codex",
      rows: 32,
      workspaceId: `ws_${crypto.randomUUID()}`,
    });
    const events: string[] = [];
    const disposeStream = await attachTerminalStream(terminal.id, 120, 32, null, () => {});
    const unlisten = await subscribeToLifecycleEvents(["terminal.harness_turn_completed"], (event) => {
      if (event.terminal_id === terminal.id) {
        events.push(event.workspace_id);
      }
    });

    try {
      await writeTerminal(terminal.id, "help\r");
      expect(events).toEqual([terminal.workspace_id]);
    } finally {
      disposeStream();
      unlisten();
    }
  });
});

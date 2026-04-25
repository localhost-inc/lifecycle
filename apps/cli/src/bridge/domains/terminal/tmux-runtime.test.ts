import { describe, expect, test } from "bun:test";
import {
  buildEnsureTmuxConnectionCommand,
  parseTmuxTerminalRecords,
  resolveTmuxRuntimeProfile,
} from "./tmux-runtime";

describe("tmux terminal runtime", () => {
  test("preserves Claude and Codex kinds for numbered launcher tabs", () => {
    const terminals = parseTmuxTerminalRecords("@1\tClaude 2\t0\t0\n@2\tCodex 3\t1\t0\n");

    expect(terminals).toEqual([
      {
        id: "@1",
        title: "Claude 2",
        kind: "claude",
        busy: false,
      },
      {
        id: "@2",
        title: "Codex 3",
        kind: "codex",
        busy: true,
      },
    ]);
  });

  test("enables mouse mode for per-surface mirror sessions", () => {
    const command = buildEnsureTmuxConnectionCommand(
      resolveTmuxRuntimeProfile({ persistenceMode: "managed" }),
      "workspace-session",
      "workspace-session--conn--surface--_4",
      "@4",
      "/tmp/workspace",
    );

    expect(command).toContain(
      "'tmux' '-L' 'lifecycle-managed-v2' '-f' '/dev/null' 'set-option' '-t' 'workspace-session--conn--surface--_4' 'mouse' 'on'",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { shouldAutoCreateDefaultWorkspaceTerminal } from "@/features/workspaces/canvas/workspace-canvas-controller";

describe("shouldAutoCreateDefaultWorkspaceTerminal", () => {
  test("does not auto-create before workspace terminals resolve", () => {
    expect(
      shouldAutoCreateDefaultWorkspaceTerminal({
        documentCount: 0,
        terminalCount: 0,
        terminalsResolved: false,
      }),
    ).toBeFalse();
  });

  test("only auto-creates when the resolved workspace is truly empty", () => {
    expect(
      shouldAutoCreateDefaultWorkspaceTerminal({
        documentCount: 0,
        terminalCount: 0,
        terminalsResolved: true,
      }),
    ).toBeTrue();

    expect(
      shouldAutoCreateDefaultWorkspaceTerminal({
        documentCount: 1,
        terminalCount: 0,
        terminalsResolved: true,
      }),
    ).toBeFalse();

    expect(
      shouldAutoCreateDefaultWorkspaceTerminal({
        documentCount: 0,
        terminalCount: 1,
        terminalsResolved: true,
      }),
    ).toBeFalse();
  });
});

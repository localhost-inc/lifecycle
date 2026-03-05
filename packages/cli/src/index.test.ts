import { describe, expect, test } from "bun:test";

import { HELP_TEXT, runCli } from "./index";

describe("cli scaffold", () => {
  test("prints help with no args", () => {
    const messages: string[] = [];
    const code = runCli([], {
      stdout: (message) => messages.push(message),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(messages[0]).toBe(HELP_TEXT);
  });

  test("returns an error for unknown flags", () => {
    const stderr: string[] = [];
    const code = runCli(["workspace", "create"], {
      stdout: () => undefined,
      stderr: (message) => stderr.push(message),
    });

    expect(code).toBe(1);
    expect(stderr[0]).toContain("Unknown arguments");
  });
});

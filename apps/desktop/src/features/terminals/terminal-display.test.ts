import { describe, expect, test } from "bun:test";

import { DEFAULT_TERMINAL_FONT_SIZE } from "./terminal-display";

describe("terminal display", () => {
  test("keeps the shared native terminal font size stable", () => {
    expect(DEFAULT_TERMINAL_FONT_SIZE).toBe(14);
  });
});

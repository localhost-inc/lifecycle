import { describe, expect, test } from "bun:test";

import { parseTmuxPaneActivity } from "./activity";

describe("parseTmuxPaneActivity", () => {
  test("marks a session busy when any pane foreground command is non-shell", () => {
    expect(parseTmuxPaneActivity("zsh\t100\nnode\t105\n")).toEqual({
      busy: true,
      activity_at: 105,
    });
  });

  test("tracks latest activity while keeping shell-only sessions idle", () => {
    expect(parseTmuxPaneActivity("zsh\t100\nbash\t104\n")).toEqual({
      busy: false,
      activity_at: 104,
    });
  });

  test("treats agent CLIs as busy while turn activity is recent", () => {
    expect(parseTmuxPaneActivity("claude\t100\n", 103)).toEqual({
      busy: true,
      activity_at: 100,
    });
  });

  test("treats idle agent CLIs as non-busy once activity is stale", () => {
    expect(parseTmuxPaneActivity("claude\t100\ncodex\t104\n", 110)).toEqual({
      busy: false,
      activity_at: 104,
    });
  });

  test("treats version-like process titles (e.g. Claude Code) as activity-gated", () => {
    // Claude Code sets process.title to its version, so tmux reports "2.1.91"
    expect(parseTmuxPaneActivity("2.1.91\t100\n", 110)).toEqual({
      busy: false,
      activity_at: 100,
    });
    expect(parseTmuxPaneActivity("2.1.91\t100\n", 103)).toEqual({
      busy: true,
      activity_at: 100,
    });
  });
});

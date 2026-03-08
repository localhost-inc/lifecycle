import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalLaunchActions } from "./terminal-launch-actions";

describe("TerminalLaunchActions", () => {
  test("renders launch icon buttons without button borders", () => {
    const markup = renderToStaticMarkup(
      createElement(TerminalLaunchActions, {
        creatingSelection: null,
        onCreateTerminal: () => {},
      }),
    );

    expect(markup).toContain("title=\"New shell\"");
    expect(markup).toContain("title=\"New Claude session\"");
    expect(markup).toContain("title=\"New Codex session\"");
    expect(markup).toContain("border-0");
    expect(markup).toContain("gap-1.5");
  });
});

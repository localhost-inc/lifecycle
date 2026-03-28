import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("main.css", () => {
  test("registers the shared UI workspace as a Tailwind source", () => {
    const css = readFileSync(new URL("./main.css", import.meta.url), "utf8");

    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain('@source "../../../packages/ui/src";');
  });

  test("streamdown styles trim trailing margins for nested list paragraphs", () => {
    const css = readFileSync(
      new URL("./features/agents/components/parts/streamdown.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain(".agent-streamdown > *:last-child");
    expect(css).toContain(".agent-streamdown li > p:last-child");
    expect(css).toContain("margin-bottom: 0 !important;");
  });
});

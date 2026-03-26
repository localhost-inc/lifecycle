import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("markdown-file-renderer-view.css", () => {
  test("uses the accent token for link color instead of accent foreground", () => {
    const css = readFileSync(new URL("./markdown-file-renderer-view.css", import.meta.url), "utf8");

    expect(css).toContain("color: var(--accent);");
    expect(css).toContain("text-decoration-color: var(--border);");
    expect(css).not.toContain("color: var(--accent-foreground);");
  });
});

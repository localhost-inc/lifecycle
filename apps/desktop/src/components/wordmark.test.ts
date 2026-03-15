import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("wordmark styles", () => {
  test("uses the semantic accent token for the hover highlight", () => {
    const css = readFileSync(new URL("./wordmark.module.css", import.meta.url), "utf8");

    expect(css).toContain("color: var(--accent);");
    expect(css).not.toContain("color: var(--ring);");
  });
});

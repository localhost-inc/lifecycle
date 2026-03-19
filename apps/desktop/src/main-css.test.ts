import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("main.css", () => {
  test("registers the shared UI workspace as a Tailwind source", () => {
    const css = readFileSync(new URL("./main.css", import.meta.url), "utf8");

    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain('@source "../../../packages/ui/src";');
  });
});

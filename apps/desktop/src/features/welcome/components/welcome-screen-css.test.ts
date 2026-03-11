import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("welcome-screen.css", () => {
  test("gives the logo a separate swell and collapse motion", () => {
    const css = readFileSync(new URL("./welcome-screen.css", import.meta.url), "utf8");

    expect(css).toContain("@keyframes welcome-logo-swell");
    expect(css).toContain("scale(1.06)");
    expect(css).toContain(".welcome-logo-swell");
    expect(css).toContain("700ms");
    expect(css).toContain("@keyframes welcome-logo-settle");
    expect(css).toContain("scale(0.58)");
    expect(css).toContain("-42px");
    expect(css).toContain("1000ms");
  });
});

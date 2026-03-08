import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("theme.css", () => {
  test("keeps sidebar background aligned with the panel token in every theme block", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
    const sidebarBackgroundMatches = [...css.matchAll(/--sidebar-background:\s*([^;]+);/g)];

    expect(sidebarBackgroundMatches.length).toBeGreaterThan(0);
    for (const match of sidebarBackgroundMatches) {
      expect(match[1]?.trim()).toBe("var(--panel)");
    }
  });
});

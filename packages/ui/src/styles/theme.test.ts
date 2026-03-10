import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("theme.css", () => {
  test("keeps sidebar background aligned with the panel token in every theme file", () => {
    const themesDir = new URL("./themes/", import.meta.url);
    const themeFiles = readdirSync(themesDir).filter(
      (file) => file.endsWith(".css") && file !== "index.css",
    );

    expect(themeFiles.length).toBeGreaterThan(0);

    for (const file of themeFiles) {
      const css = readFileSync(join(themesDir.pathname, file), "utf8");
      const sidebarBackgroundMatches = [...css.matchAll(/--sidebar-background:\s*([^;]+);/g)];

      expect(sidebarBackgroundMatches.length).toBeGreaterThan(0);
      for (const match of sidebarBackgroundMatches) {
        expect(match[1]?.trim()).toBe("var(--panel)");
      }
    }
  });

  test("keeps a shared pointer affordance for native and role-based buttons", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

    expect(css).toContain(':where(button, [role="button"])');
    expect(css).toContain("cursor: pointer;");
  });

  test("defines the shared compact control treatment for themed button-like surfaces", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

    expect(css).toContain("--control-compact-height: 32px;");
    expect(css).toContain("--control-compact-radius: var(--radius-xl);");
    expect(css).toContain(".compact-control-shell");
    expect(css).toContain(".compact-control-standalone");
    expect(css).toContain(".compact-control-tone-active");
  });

  test("defines a shared panel title treatment for sidebar and rail headers", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

    expect(css).toContain(".app-panel-title");
    expect(css).toContain("font-family: var(--font-mono);");
    expect(css).toContain("font-size: 12px;");
    expect(css).toContain("font-weight: 500;");
    expect(css).toContain("color: var(--sidebar-muted-foreground);");
  });

  test("defaults shared monospace typography to Geist Mono without bundled branding", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

    expect(css).toContain('--font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;');
    expect(css).not.toContain("Lifecycle Mono");
  });
});

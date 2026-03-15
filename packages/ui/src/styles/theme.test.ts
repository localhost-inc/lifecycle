import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readThemeFile(name: string): string {
  return readFileSync(new URL(`./themes/${name}.css`, import.meta.url), "utf8");
}

function readThemeToken(css: string, token: string): string[] {
  return [...css.matchAll(new RegExp(`${token}:\\s*([^;]+);`, "g"))]
    .map((match) => match[1]?.trim() ?? "")
    .filter((value) => value.length > 0);
}

describe("theme.css", () => {
  test("defines a semantic accent token in every theme file", () => {
    const themesDir = new URL("./themes/", import.meta.url);
    const themeFiles = readdirSync(themesDir).filter(
      (file) => file.endsWith(".css") && file !== "index.css",
    );

    for (const file of themeFiles) {
      const css = readFileSync(join(themesDir.pathname, file), "utf8");
      const accentValues = readThemeToken(css, "--accent");

      expect(accentValues.length).toBeGreaterThan(0);
    }
  });

  test("uses the lifecycle accent blue in the light and dark presets", () => {
    for (const preset of ["light", "dark"] as const) {
      const css = readThemeFile(preset);
      const accentValues = readThemeToken(css, "--accent");
      const accentForegroundValues = readThemeToken(css, "--accent-foreground");

      expect(accentValues[0]).toBe("#1877f2");
      expect(accentForegroundValues[0]).toBe("#ffffff");
    }
  });

  test("keeps terminal surfaces aligned with the theme surface token in every preset", () => {
    const themesDir = new URL("./themes/", import.meta.url);
    const themeFiles = readdirSync(themesDir).filter(
      (file) => file.endsWith(".css") && file !== "index.css",
    );

    for (const file of themeFiles) {
      const css = readFileSync(join(themesDir.pathname, file), "utf8");
      const terminalSurfaceValues = readThemeToken(css, "--terminal-surface-background");

      expect(terminalSurfaceValues.length).toBeGreaterThan(0);
      for (const value of terminalSurfaceValues) {
        expect(value).toBe("var(--surface)");
      }
    }
  });

  test("keeps sidebar background aligned with the surface token in every theme file", () => {
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
        expect(match[1]?.trim()).toBe("var(--surface)");
      }
    }
  });

  test("keeps a shared pointer affordance for native and role-based buttons", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

    expect(css).toContain(':where(button, [role="button"])');
    expect(css).toContain("cursor: pointer;");
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

  test("defines shared lifecycle logo stroke animations for reusable loading states", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

    expect(css).toContain("@keyframes lifecycle-logo-draw-left");
    expect(css).toContain("@keyframes lifecycle-logo-draw-right");
    expect(css).toContain('[data-lifecycle-logo-path="left"]');
    expect(css).toContain('[data-lifecycle-logo-path="right"]');
  });

  test("keeps shell layers visually distinct in the light and dark presets", () => {
    for (const preset of ["light", "dark"] as const) {
      const css = readThemeFile(preset);
      const backgrounds = readThemeToken(css, "--background");
      const surfaces = readThemeToken(css, "--surface");
      const cards = readThemeToken(css, "--card");
      const surfaceHovers = readThemeToken(css, "--surface-hover");
      const surfaceSelected = readThemeToken(css, "--surface-selected");
      const sidebarHovers = readThemeToken(css, "--sidebar-hover");
      const sidebarSelected = readThemeToken(css, "--sidebar-selected");

      expect(backgrounds.length).toBeGreaterThan(0);
      expect(surfaces.length).toBeGreaterThan(0);
      expect(cards.length).toBeGreaterThan(0);

      for (const value of backgrounds) {
        expect(value).not.toBe(surfaces[0]);
        expect(value).not.toBe(cards[0]);
      }

      for (const value of surfaces) {
        expect(value).not.toBe(cards[0]);
      }

      expect(surfaceHovers[0]).not.toBe(surfaceSelected[0]);
      expect(sidebarHovers[0]).not.toBe(sidebarSelected[0]);
    }
  });
});

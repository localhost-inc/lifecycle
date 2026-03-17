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

function readSingleThemeToken(css: string, token: string): string {
  const values = [...new Set(readThemeToken(css, token))];

  expect(values.length).toBeGreaterThan(0);
  return values[0] ?? "";
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

  test("uses goldenrod accent tokens in the lifecycle light and dark presets", () => {
    const lightCss = readThemeFile("lifecycle-light");
    expect(readThemeToken(lightCss, "--accent")[0]).toBe("#b38600");
    expect(readThemeToken(lightCss, "--accent-foreground")[0]).toBe("#ffffff");

    const darkCss = readThemeFile("lifecycle-dark");
    expect(readThemeToken(darkCss, "--accent")[0]).toBe("#d4a41c");
    expect(readThemeToken(darkCss, "--accent-foreground")[0]).toBe("#171411");
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
        const value = match[1]?.trim() ?? "";
        expect(value === "var(--surface)" || value === "var(--background)").toBe(true);
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

  test("keeps shell layers visually distinct in every preset", () => {
    const themesDir = new URL("./themes/", import.meta.url);
    const themeFiles = readdirSync(themesDir).filter(
      (file) => file.endsWith(".css") && file !== "index.css",
    );

    for (const file of themeFiles) {
      const css = readFileSync(join(themesDir.pathname, file), "utf8");
      const background = readSingleThemeToken(css, "--background");
      const surface = readSingleThemeToken(css, "--surface");
      const card = readSingleThemeToken(css, "--card");
      const surfaceHover = readSingleThemeToken(css, "--surface-hover");
      const surfaceSelected = readSingleThemeToken(css, "--surface-selected");
      const sidebarHover = readSingleThemeToken(css, "--sidebar-hover");
      const sidebarSelected = readSingleThemeToken(css, "--sidebar-selected");

      expect(background).not.toBe(surface);
      expect(background).not.toBe(card);
      expect(surface).not.toBe(card);
      expect(surfaceHover).not.toBe(surfaceSelected);
      expect(sidebarHover).not.toBe(sidebarSelected);
    }
  });

  test("keeps terminal ansi lanes distinguishable in every preset", () => {
    const themesDir = new URL("./themes/", import.meta.url);
    const themeFiles = readdirSync(themesDir).filter(
      (file) => file.endsWith(".css") && file !== "index.css",
    );

    for (const file of themeFiles) {
      const css = readFileSync(join(themesDir.pathname, file), "utf8");
      const green = readSingleThemeToken(css, "--terminal-ansi-green");
      const blue = readSingleThemeToken(css, "--terminal-ansi-blue");
      const cyan = readSingleThemeToken(css, "--terminal-ansi-cyan");
      const brightBlue = readSingleThemeToken(css, "--terminal-ansi-bright-blue");
      const brightCyan = readSingleThemeToken(css, "--terminal-ansi-bright-cyan");

      expect(green).not.toBe(cyan);
      expect(blue).not.toBe(cyan);
      expect(brightBlue).not.toBe(brightCyan);
    }
  });
});

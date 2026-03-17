import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import githubDarkDefault from "@shikijs/themes/github-dark-default";
import githubLightDefault from "@shikijs/themes/github-light-default";

function readThemeCss(name: "github-light" | "github-dark"): string {
  return readFileSync(
    new URL(`../../../../packages/ui/src/styles/themes/${name}.css`, import.meta.url),
    "utf8",
  );
}

function readThemeToken(css: string, token: string): string {
  const match = new RegExp(`${token}:\\s*([^;]+);`).exec(css);

  expect(match?.[1]).toBeDefined();
  return match?.[1]?.trim() ?? "";
}

describe("github theme contract", () => {
  test("maps github light shell tokens to the shiki theme payload", () => {
    const css = readThemeCss("github-light");
    const c = (key: string) => githubLightDefault.colors![key]!;

    expect(readThemeToken(css, "--foreground")).toBe(c("foreground"));
    expect(readThemeToken(css, "--primary")).toBe(c("button.background"));
    expect(readThemeToken(css, "--accent")).toBe(c("focusBorder"));
    expect(readThemeToken(css, "--destructive")).toBe(c("errorForeground"));
    expect(readThemeToken(css, "--ring")).toBe(c("focusBorder"));
    expect(readThemeToken(css, "--terminal-cursor-color")).toBe(c("editorCursor.foreground"));
    expect(readThemeToken(css, "--terminal-ansi-blue")).toBe(c("terminal.ansiBlue"));
    expect(readThemeToken(css, "--git-status-added")).toBe(
      c("gitDecoration.addedResourceForeground"),
    );
    expect(readThemeToken(css, "--git-status-deleted")).toBe(
      c("gitDecoration.deletedResourceForeground"),
    );
  });

  test("maps github dark shell tokens to the shiki theme payload", () => {
    const css = readThemeCss("github-dark");
    const c = (key: string) => githubDarkDefault.colors![key]!;

    expect(readThemeToken(css, "--foreground")).toBe(c("foreground"));
    expect(readThemeToken(css, "--primary")).toBe(c("button.background"));
    expect(readThemeToken(css, "--accent")).toBe(c("focusBorder"));
    expect(readThemeToken(css, "--destructive")).toBe(c("errorForeground"));
    expect(readThemeToken(css, "--ring")).toBe(c("focusBorder"));
    expect(readThemeToken(css, "--terminal-cursor-color")).toBe(c("editorCursor.foreground"));
    expect(readThemeToken(css, "--terminal-ansi-blue")).toBe(c("terminal.ansiBlue"));
    expect(readThemeToken(css, "--git-status-added")).toBe(
      c("gitDecoration.addedResourceForeground"),
    );
    expect(readThemeToken(css, "--git-status-deleted")).toBe(
      c("gitDecoration.deletedResourceForeground"),
    );
  });
});

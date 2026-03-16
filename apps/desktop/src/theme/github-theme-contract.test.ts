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
    const colors = githubLightDefault.colors ?? {};

    expect(readThemeToken(css, "--background")).toBe(colors["editor.background"]);
    expect(readThemeToken(css, "--foreground")).toBe(colors["foreground"]);
    expect(readThemeToken(css, "--surface")).toBe(colors["sideBar.background"]);
    expect(readThemeToken(css, "--card")).toBe(colors["button.secondaryBackground"]);
    expect(readThemeToken(css, "--primary")).toBe(colors["button.background"]);
    expect(readThemeToken(css, "--accent")).toBe(colors["focusBorder"]);
    expect(readThemeToken(css, "--destructive")).toBe(colors["errorForeground"]);
    expect(readThemeToken(css, "--ring")).toBe(colors["focusBorder"]);
    expect(readThemeToken(css, "--terminal-cursor-color")).toBe(colors["editorCursor.foreground"]);
    expect(readThemeToken(css, "--terminal-ansi-blue")).toBe(colors["terminal.ansiBlue"]);
    expect(readThemeToken(css, "--git-status-added")).toBe(
      colors["gitDecoration.addedResourceForeground"],
    );
    expect(readThemeToken(css, "--git-status-deleted")).toBe(
      colors["gitDecoration.deletedResourceForeground"],
    );
  });

  test("maps github dark shell tokens to the shiki theme payload", () => {
    const css = readThemeCss("github-dark");
    const colors = githubDarkDefault.colors ?? {};

    expect(readThemeToken(css, "--background")).toBe(colors["editor.background"]);
    expect(readThemeToken(css, "--foreground")).toBe(colors["foreground"]);
    expect(readThemeToken(css, "--surface")).toBe(colors["sideBar.background"]);
    expect(readThemeToken(css, "--card")).toBe(colors["quickInput.background"]);
    expect(readThemeToken(css, "--primary")).toBe(colors["button.background"]);
    expect(readThemeToken(css, "--accent")).toBe(colors["focusBorder"]);
    expect(readThemeToken(css, "--destructive")).toBe(colors["errorForeground"]);
    expect(readThemeToken(css, "--ring")).toBe(colors["focusBorder"]);
    expect(readThemeToken(css, "--terminal-cursor-color")).toBe(colors["editorCursor.foreground"]);
    expect(readThemeToken(css, "--terminal-ansi-blue")).toBe(colors["terminal.ansiBlue"]);
    expect(readThemeToken(css, "--git-status-added")).toBe(
      colors["gitDecoration.addedResourceForeground"],
    );
    expect(readThemeToken(css, "--git-status-deleted")).toBe(
      colors["gitDecoration.deletedResourceForeground"],
    );
  });
});

import { describe, expect, test } from "bun:test";
import {
  LIFECYCLE_DARK_DIFF_THEME,
  LIFECYCLE_LIGHT_DIFF_THEME,
} from "@lifecycle/ui";
import githubDarkDefault from "@shikijs/themes/github-dark-default";
import githubLightDefault from "@shikijs/themes/github-light-default";
import { buildLifecycleDiffTheme } from "./lifecycle-diff-themes";

describe("buildLifecycleDiffTheme", () => {
  test("retains github syntax tokens while aligning lifecycle light surfaces", () => {
    const theme = buildLifecycleDiffTheme(githubLightDefault, "light");

    expect(theme.name).toBe(LIFECYCLE_LIGHT_DIFF_THEME);
    expect(theme.type).toBe("light");
    expect(theme.colors?.["editor.background"]).toBe("#fafaf9");
    expect(theme.colors?.["editor.foreground"]).toBe("#09090b");
    expect(theme.colors?.["gitDecoration.addedResourceForeground"]).toBe("#16a34a");
    expect(theme.colors?.["gitDecoration.deletedResourceForeground"]).toBe("#dc2626");
    expect(theme.tokenColors).toEqual(githubLightDefault.tokenColors);
  });

  test("retains github syntax tokens while aligning lifecycle dark surfaces", () => {
    const theme = buildLifecycleDiffTheme(githubDarkDefault, "dark");

    expect(theme.name).toBe(LIFECYCLE_DARK_DIFF_THEME);
    expect(theme.type).toBe("dark");
    expect(theme.colors?.["editor.background"]).toBe("#0d0c0a");
    expect(theme.colors?.["editor.foreground"]).toBe("#fafaf9");
    expect(theme.colors?.["gitDecoration.modifiedResourceForeground"]).toBe("#fbbf24");
    expect(theme.colors?.["terminal.ansiBlue"]).toBe("#60a5fa");
    expect(theme.tokenColors).toEqual(githubDarkDefault.tokenColors);
  });
});

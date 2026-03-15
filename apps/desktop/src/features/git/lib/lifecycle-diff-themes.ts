import {
  RegisteredCustomThemes,
  registerCustomTheme,
  type ThemeRegistrationResolved,
} from "@pierre/diffs";
import { LIFECYCLE_DARK_DIFF_THEME, LIFECYCLE_LIGHT_DIFF_THEME } from "@lifecycle/ui";
import githubDarkDefault from "@shikijs/themes/github-dark-default";
import githubLightDefault from "@shikijs/themes/github-light-default";

type LifecycleDiffAppearance = "light" | "dark";

const LIFECYCLE_DIFF_SURFACES = {
  dark: {
    added: "#4ade80",
    background: "#0d0c0a",
    border: "#282724",
    deleted: "#f87171",
    foreground: "#fafaf9",
    modified: "#fbbf24",
    muted: "#78756e",
    renamed: "#60a5fa",
  },
  light: {
    added: "#16a34a",
    background: "#fafaf9",
    border: "#edeceb",
    deleted: "#dc2626",
    foreground: "#09090b",
    modified: "#ca8a04",
    muted: "#78716c",
    renamed: "#2563eb",
  },
} as const;

function rgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const channel =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => value + value)
          .join("")
      : normalized;
  const red = Number.parseInt(channel.slice(0, 2), 16);
  const green = Number.parseInt(channel.slice(2, 4), 16);
  const blue = Number.parseInt(channel.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function buildLifecycleDiffTheme(
  baseTheme: ThemeRegistrationResolved,
  appearance: LifecycleDiffAppearance,
): ThemeRegistrationResolved {
  const surface = LIFECYCLE_DIFF_SURFACES[appearance];

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      foreground: surface.foreground,
      "editor.background": surface.background,
      "editor.foreground": surface.foreground,
      "editor.lineHighlightBackground":
        appearance === "light" ? rgba(surface.border, 0.45) : rgba(surface.border, 0.7),
      "editorGutter.addedBackground": rgba(surface.added, appearance === "light" ? 0.32 : 0.4),
      "editorGutter.deletedBackground": rgba(surface.deleted, appearance === "light" ? 0.22 : 0.38),
      "editorGutter.modifiedBackground": rgba(
        surface.modified,
        appearance === "light" ? 0.22 : 0.34,
      ),
      "editorLineNumber.activeForeground": surface.foreground,
      "editorLineNumber.foreground": surface.muted,
      "editorOverviewRuler.border": surface.background,
      "editorWidget.background": surface.background,
      "gitDecoration.addedResourceForeground": surface.added,
      "gitDecoration.deletedResourceForeground": surface.deleted,
      "gitDecoration.modifiedResourceForeground": surface.modified,
      "gitDecoration.untrackedResourceForeground": surface.added,
      "panel.background": surface.background,
      "panel.border": surface.border,
      "sideBar.background": surface.background,
      "sideBar.border": surface.border,
      "sideBarSectionHeader.background": surface.background,
      "sideBarSectionHeader.border": surface.border,
      "statusBar.background": surface.background,
      "statusBar.border": surface.border,
      "statusBar.noFolderBackground": surface.background,
      "tab.activeBackground": surface.background,
      "tab.activeBorder": surface.background,
      "tab.border": surface.border,
      "tab.hoverBackground": surface.background,
      "tab.inactiveBackground": surface.background,
      "tab.unfocusedActiveBorder": surface.background,
      "terminal.ansiBlue": surface.renamed,
      "terminal.ansiBrightBlue": surface.renamed,
      "terminal.ansiBrightGreen": surface.added,
      "terminal.ansiBrightRed": surface.deleted,
      "terminal.ansiBrightYellow": surface.modified,
      "terminal.ansiGreen": surface.added,
      "terminal.ansiRed": surface.deleted,
      "terminal.ansiYellow": surface.modified,
      "terminal.foreground": surface.foreground,
    },
    displayName: appearance === "light" ? "Lifecycle Light Diff" : "Lifecycle Dark Diff",
    name: appearance === "light" ? LIFECYCLE_LIGHT_DIFF_THEME : LIFECYCLE_DARK_DIFF_THEME,
    type: appearance,
  };
}

export function ensureLifecycleDiffThemesRegistered(): void {
  if (!RegisteredCustomThemes.has(LIFECYCLE_LIGHT_DIFF_THEME)) {
    registerCustomTheme(LIFECYCLE_LIGHT_DIFF_THEME, () =>
      Promise.resolve(buildLifecycleDiffTheme(githubLightDefault, "light")),
    );
  }

  if (!RegisteredCustomThemes.has(LIFECYCLE_DARK_DIFF_THEME)) {
    registerCustomTheme(LIFECYCLE_DARK_DIFF_THEME, () =>
      Promise.resolve(buildLifecycleDiffTheme(githubDarkDefault, "dark")),
    );
  }
}

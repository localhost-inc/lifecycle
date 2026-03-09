export type Theme =
  | "system"
  | "light"
  | "dark"
  | "nord"
  | "monokai"
  | "catppuccin"
  | "dracula"
  | "rose-pine";

export type ResolvedTheme = Exclude<Theme, "system">;

export const themeOptions: Array<{
  label: string;
  value: Theme;
  appearance: "light" | "dark";
  shikiTheme: string;
}> = [
  { label: "System", value: "system", appearance: "light", shikiTheme: "" },
  {
    label: "Lifecycle Light",
    value: "light",
    appearance: "light",
    shikiTheme: "github-light-default",
  },
  { label: "Lifecycle Dark", value: "dark", appearance: "dark", shikiTheme: "github-dark-default" },
  { label: "Nord", value: "nord", appearance: "dark", shikiTheme: "nord" },
  { label: "Monokai", value: "monokai", appearance: "dark", shikiTheme: "monokai" },
  { label: "Catppuccin", value: "catppuccin", appearance: "dark", shikiTheme: "catppuccin-mocha" },
  { label: "Dracula", value: "dracula", appearance: "dark", shikiTheme: "dracula" },
  { label: "Rose Pine", value: "rose-pine", appearance: "dark", shikiTheme: "rose-pine" },
];

const THEME_VALUES = new Set<string>(themeOptions.map((option) => option.value));

const themeConfig = new Map(themeOptions.map((o) => [o.value, o]));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_VALUES.has(value);
}

export function diffTheme(theme: ResolvedTheme): string {
  return themeConfig.get(theme)?.shikiTheme ?? theme;
}

export function themeAppearance(theme: ResolvedTheme): "light" | "dark" {
  return themeConfig.get(theme)?.appearance ?? "dark";
}

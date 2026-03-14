export const GIT_PANEL_TABS = [
  { label: "Changes", value: "changes" },
  { label: "History", value: "history" },
] as const;

export type GitPanelTabValue = (typeof GIT_PANEL_TABS)[number]["value"];

export function isGitPanelTabValue(value: string | null | undefined): value is GitPanelTabValue {
  return GIT_PANEL_TABS.some((tab) => tab.value === value);
}

export const settingsSections = [
  { slug: "account", label: "Account" },
  { slug: "appearance", label: "Appearance" },
  { slug: "notifications", label: "Notifications" },
  { slug: "workspace", label: "Workspace" },
  { slug: "worktrees", label: "Worktrees" },
] as const;

export type SettingsSectionSlug = (typeof settingsSections)[number]["slug"];

const settingsSectionSlugSet = new Set<string>(settingsSections.map((section) => section.slug));

export function isSettingsSectionSlug(
  value: string | null | undefined,
): value is SettingsSectionSlug {
  return typeof value === "string" && settingsSectionSlugSet.has(value);
}

export function readSettingsSectionHash(hash: string): SettingsSectionSlug | null {
  const normalized = hash.trim().replace(/^#/, "");
  return isSettingsSectionSlug(normalized) ? normalized : null;
}

export const settingsSections = [
  { slug: "appearance", label: "Appearance" },
  { slug: "agents", label: "Agents" },
  { slug: "workspace", label: "Workspace" },
  { slug: "notifications", label: "Notifications" },
  { slug: "account", label: "Account" },
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

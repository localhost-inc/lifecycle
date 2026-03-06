export interface SettingsNavItem {
  slug: string;
  label: string;
}

export const settingsNavItems: SettingsNavItem[] = [
  { slug: "general", label: "General" },
  { slug: "configuration", label: "Configuration" },
  { slug: "personalization", label: "Personalization" },
  { slug: "mcp-servers", label: "MCP servers" },
  { slug: "git", label: "Git" },
  { slug: "environments", label: "Environments" },
  { slug: "worktrees", label: "Worktrees" },
  { slug: "archived-threads", label: "Archived threads" },
];

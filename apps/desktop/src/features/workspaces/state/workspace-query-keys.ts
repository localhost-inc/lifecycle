export const workspaceKeys = {
  activity: (workspaceId: string) => ["workspace-activity", workspaceId] as const,
  byProject: () => ["workspaces", "by-project"] as const,
  detail: (workspaceId: string) => ["workspace", workspaceId] as const,
  environmentTasks: (workspaceId: string) => ["workspace-environment-tasks", workspaceId] as const,
  file: (workspaceId: string, filePath: string) =>
    ["workspace-file", workspaceId, filePath] as const,
  fileTree: (workspaceId: string) => ["workspace-file-tree", workspaceId] as const,
  manifest: (workspaceId: string) => ["workspace-manifest", workspaceId] as const,
  runtimeProjection: (workspaceId: string) =>
    ["workspace-runtime-projection", workspaceId] as const,
  services: (workspaceId: string) => ["workspace-services", workspaceId] as const,
  setup: (workspaceId: string) => ["workspace-setup", workspaceId] as const,
  snapshot: (workspaceId: string) => ["workspace-snapshot", workspaceId] as const,
};

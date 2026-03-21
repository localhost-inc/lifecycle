export const workspaceKeys = {
  activity: (workspaceId: string) => ["workspace-activity", workspaceId] as const,
  byProject: () => ["workspaces", "by-project"] as const,
  detail: (workspaceId: string) => ["workspace", workspaceId] as const,
  file: (workspaceId: string, filePath: string) =>
    ["workspace-file", workspaceId, filePath] as const,
  fileTree: (workspaceId: string) => ["workspace-file-tree", workspaceId] as const,
  manifest: (workspaceId: string) => ["workspace-manifest", workspaceId] as const,
  serviceLogs: (workspaceId: string) => ["workspace-service-logs", workspaceId] as const,
  services: (workspaceId: string) => ["workspace-services", workspaceId] as const,
};

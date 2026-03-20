export const gitKeys = {
  currentPullRequest: (workspaceId: string) =>
    ["workspace-git-current-pull-request", workspaceId] as const,
  log: (workspaceId: string, limit: number) => ["workspace-git-log", workspaceId, limit] as const,
  pullRequest: (workspaceId: string, pullRequestNumber: number) =>
    ["workspace-git-pull-request", workspaceId, pullRequestNumber] as const,
  pullRequests: (workspaceId: string) => ["workspace-git-pull-requests", workspaceId] as const,
  status: (workspaceId: string) => ["workspace-git-status", workspaceId] as const,
};

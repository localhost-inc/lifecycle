export const agentKeys = {
  all: () => ["agents"] as const,
  byWorkspace: (workspaceId: string) => ["agents", "workspace", workspaceId] as const,
  detail: (agentSessionId: string) => ["agents", "detail", agentSessionId] as const,
  messages: (agentSessionId: string) => ["agents", "messages", agentSessionId] as const,
};

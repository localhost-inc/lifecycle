import type { PropsWithChildren } from "react";
import type { AgentClient } from "@lifecycle/agents";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { AgentClientProvider } from "@lifecycle/agents/react";
import { WorkspaceClientProvider } from "@lifecycle/workspace/react";

interface WorkspaceScopeProps extends PropsWithChildren {
  agentClient: AgentClient;
  workspaceClient: WorkspaceClient;
}

export function WorkspaceScope({ agentClient, workspaceClient, children }: WorkspaceScopeProps) {
  return (
    <WorkspaceClientProvider workspaceClient={workspaceClient}>
      <AgentClientProvider agentClient={agentClient}>{children}</AgentClientProvider>
    </WorkspaceClientProvider>
  );
}

import type { PropsWithChildren } from "react";
import type { AgentClient } from "@lifecycle/agents";
import type { EnvironmentClient } from "@lifecycle/environment";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { AgentClientProvider } from "@lifecycle/agents/react";
import { EnvironmentClientProvider } from "@lifecycle/environment/react";
import { WorkspaceClientProvider } from "@lifecycle/workspace/react";

interface WorkspaceScopeProps extends PropsWithChildren {
  agentClient: AgentClient;
  environmentClient: EnvironmentClient;
  workspaceClient: WorkspaceClient;
}

export function WorkspaceScope({
  agentClient,
  environmentClient,
  workspaceClient,
  children,
}: WorkspaceScopeProps) {
  return (
    <WorkspaceClientProvider workspaceClient={workspaceClient}>
      <EnvironmentClientProvider environmentClient={environmentClient}>
        <AgentClientProvider agentClient={agentClient}>{children}</AgentClientProvider>
      </EnvironmentClientProvider>
    </WorkspaceClientProvider>
  );
}

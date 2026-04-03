import type { PropsWithChildren } from "react";
import type { AgentClient } from "@lifecycle/agents";
import type { StackClient } from "@lifecycle/stack";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { AgentClientProvider } from "@lifecycle/agents/react";
import { StackClientProvider } from "@lifecycle/stack/react";
import { WorkspaceClientProvider } from "@lifecycle/workspace/react";

interface WorkspaceScopeProps extends PropsWithChildren {
  agentClient: AgentClient;
  stackClient: StackClient;
  workspaceClient: WorkspaceClient;
}

export function WorkspaceScope({
  agentClient,
  stackClient,
  workspaceClient,
  children,
}: WorkspaceScopeProps) {
  return (
    <WorkspaceClientProvider workspaceClient={workspaceClient}>
      <StackClientProvider stackClient={stackClient}>
        <AgentClientProvider agentClient={agentClient}>{children}</AgentClientProvider>
      </StackClientProvider>
    </WorkspaceClientProvider>
  );
}

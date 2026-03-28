import { createContext, createElement, useContext, type PropsWithChildren } from "react";
import type { WorkspaceClient, WorkspaceClientRegistry } from "./index";

const WorkspaceClientRegistryContext = createContext<WorkspaceClientRegistry | null>(null);
const WorkspaceClientContext = createContext<WorkspaceClient | null>(null);

export function WorkspaceClientRegistryProvider({
  workspaceClientRegistry,
  children,
}: PropsWithChildren<{
  workspaceClientRegistry: WorkspaceClientRegistry;
}>) {
  return createElement(
    WorkspaceClientRegistryContext.Provider,
    { value: workspaceClientRegistry },
    children,
  );
}

export function useWorkspaceClientRegistry(): WorkspaceClientRegistry {
  const value = useContext(WorkspaceClientRegistryContext);
  if (!value) {
    throw new Error("WorkspaceClientRegistryProvider is required");
  }

  return value;
}

export function WorkspaceClientProvider({
  workspaceClient,
  children,
}: PropsWithChildren<{
  workspaceClient: WorkspaceClient;
}>) {
  return createElement(WorkspaceClientContext.Provider, { value: workspaceClient }, children);
}

export function useWorkspaceClient(): WorkspaceClient {
  const workspaceClient = useContext(WorkspaceClientContext);

  if (!workspaceClient) {
    throw new Error("WorkspaceClientProvider is required");
  }

  return workspaceClient;
}

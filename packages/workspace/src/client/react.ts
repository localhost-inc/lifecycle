import { createContext, createElement, useContext, type PropsWithChildren } from "react";
import type { WorkspaceHost } from "@lifecycle/contracts";
import type { WorkspaceHostClient, WorkspaceHostClientRegistry } from "./index";

const WorkspaceHostClientContext = createContext<WorkspaceHostClientRegistry | null>(null);

export function WorkspaceHostClientProvider({
  workspaceHostClientRegistry,
  children,
}: PropsWithChildren<{
  workspaceHostClientRegistry: WorkspaceHostClientRegistry;
}>) {
  return createElement(
    WorkspaceHostClientContext.Provider,
    { value: workspaceHostClientRegistry },
    children,
  );
}

export function useWorkspaceHostClientRegistry(): WorkspaceHostClientRegistry {
  const value = useContext(WorkspaceHostClientContext);
  if (!value) {
    throw new Error("WorkspaceHostClientProvider is required");
  }

  return value;
}

export function useWorkspaceHostClient(workspaceHost: WorkspaceHost): WorkspaceHostClient {
  return useWorkspaceHostClientRegistry().resolve(workspaceHost);
}

export function useOptionalWorkspaceHostClient(
  workspaceHost: WorkspaceHost | null | undefined,
): WorkspaceHostClient | null {
  const registry = useWorkspaceHostClientRegistry();
  return workspaceHost ? registry.resolve(workspaceHost) : null;
}

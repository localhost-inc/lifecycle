import "routedjs";
import type { SqlDriver } from "@lifecycle/db";
import type { WorkspaceHostRegistry } from "../domains/workspace";
import type { AgentManager } from "../domains/workspace/agents";
import type { createControlPlaneClient } from "../domains/auth/control-plane";

declare module "routedjs" {
  interface Register {
    appContext: {
      agentManager: AgentManager;
      db: SqlDriver;
      controlPlaneClient: ReturnType<typeof createControlPlaneClient>;
      workspaceRegistry: WorkspaceHostRegistry;
    };
  }
}

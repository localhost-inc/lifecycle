import "routedjs";
import type { SqlDriver } from "@lifecycle/db";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";
import type { createControlPlaneClient } from "./control-plane";

declare module "routedjs" {
  interface Register {
    appContext: {
      db: SqlDriver;
      controlPlaneClient: ReturnType<typeof createControlPlaneClient>;
      workspaceRegistry: WorkspaceClientRegistry;
    };
  }
}

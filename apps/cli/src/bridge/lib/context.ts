import "routedjs";
import type { SqlDriver } from "@lifecycle/db";
import type { WorkspaceHostRegistry } from "../domains/workspace";
import type { createControlPlaneClient } from "../domains/auth/control-plane";

declare module "routedjs" {
  interface Register {
    appContext: {
      db: SqlDriver;
      controlPlaneClient: ReturnType<typeof createControlPlaneClient>;
      workspaceRegistry: WorkspaceHostRegistry;
    };
  }
}

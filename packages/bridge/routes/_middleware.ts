import "../src/lib/context";

import { createMiddleware } from "routedjs";
import { getLifecycleDb } from "@lifecycle/db";

export default createMiddleware(async ({ ctx, next }) => {
  const [{ createControlPlaneClient }, { getAgentManager, getWorkspaceRegistry }] =
    await Promise.all([
      import("../src/domains/auth/control-plane"),
      import("../src/lib/server"),
    ]);

  ctx.set("agentManager", getAgentManager());
  ctx.set("db", await getLifecycleDb());
  ctx.set("controlPlaneClient", createControlPlaneClient());
  ctx.set("workspaceRegistry", getWorkspaceRegistry());
  await next();
});

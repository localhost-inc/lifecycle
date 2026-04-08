import "../src/context";

import { createMiddleware } from "routedjs";
import { getLifecycleDb } from "@lifecycle/db";
import { createControlPlaneClient } from "../src/control-plane";
import { getAgentManager, getWorkspaceRegistry } from "../src/server";

export default createMiddleware(async ({ ctx, next }) => {
  ctx.set("agentManager", getAgentManager());
  ctx.set("db", await getLifecycleDb());
  ctx.set("controlPlaneClient", createControlPlaneClient());
  ctx.set("workspaceRegistry", getWorkspaceRegistry());
  await next();
});

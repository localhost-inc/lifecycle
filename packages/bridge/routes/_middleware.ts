import "../src/context";

import { createMiddleware } from "routedjs";
import { getLifecycleDb } from "@lifecycle/db";
import { createControlPlaneClient } from "../src/control-plane";
import { getStackRegistry, getWorkspaceRegistry } from "../src/server";

export default createMiddleware(async ({ ctx, next }) => {
  ctx.set("db", await getLifecycleDb());
  ctx.set("controlPlaneClient", createControlPlaneClient());
  ctx.set("stackRegistry", getStackRegistry());
  ctx.set("workspaceRegistry", getWorkspaceRegistry());
  await next();
});

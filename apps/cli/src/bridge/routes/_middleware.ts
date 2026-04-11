import "../lib/context";

import { createMiddleware } from "routedjs";
import { getLifecycleDb } from "@lifecycle/db";

export default createMiddleware(async ({ ctx, next }) => {
  const [{ createControlPlaneClient }, { getWorkspaceRegistry }] =
    await Promise.all([
      import("../domains/auth/control-plane"),
      import("../lib/server"),
    ]);

  ctx.set("db", await getLifecycleDb());
  ctx.set("controlPlaneClient", createControlPlaneClient());
  ctx.set("workspaceRegistry", getWorkspaceRegistry());
  await next();
});

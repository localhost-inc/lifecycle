import { createRoute } from "routedjs";
import { z } from "zod";
import { createBridgeWorkspace } from "../../src/workspaces";

const workspaceHostSchema = z.enum(["local", "docker", "cloud", "remote"]);

export default createRoute({
  schemas: {
    body: z.object({
      repoPath: z.string().min(1),
      name: z.string().min(1),
      sourceRef: z.string().min(1).optional(),
      host: workspaceHostSchema.default("local"),
    }),
  },
  handler: async ({ body, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const createdWorkspace = await createBridgeWorkspace(db, workspaceRegistry, {
      repoPath: body.repoPath,
      name: body.name,
      host: body.host,
      ...(body.sourceRef ? { sourceRef: body.sourceRef } : {}),
    });

    ctx.status(201);
    return createdWorkspace;
  },
});

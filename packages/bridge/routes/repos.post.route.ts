import { createRoute } from "routedjs";
import { z } from "zod";
import { RepositoryRecordSchema } from "@lifecycle/contracts";
import {
  getRepositoryByPath,
  insertRepository,
  insertWorkspace,
  listWorkspacesByRepository,
} from "@lifecycle/db/queries";

const BridgeRepositoryCreateResponseSchema = z
  .object({
    id: RepositoryRecordSchema.shape.id,
    created: z.boolean(),
  })
  .meta({ id: "BridgeRepositoryCreateResponse" });

export default createRoute({
  schemas: {
    body: z.object({
      path: z.string().min(1),
      name: z.string().min(1),
      rootWorkspace: z
        .object({
          name: z.string().min(1),
          sourceRef: z.string().min(1),
          workspaceRoot: z.string().min(1),
        })
        .optional(),
    }),
    responses: {
      200: BridgeRepositoryCreateResponseSchema,
      201: BridgeRepositoryCreateResponseSchema,
    },
  },
  handler: async ({ body, ctx }) => {
    const db = ctx.get("db");
    const existing = await getRepositoryByPath(db, body.path);
    const repositoryId =
      existing?.id ?? (await insertRepository(db, { path: body.path, name: body.name }));

    if (body.rootWorkspace) {
      const workspaces = await listWorkspacesByRepository(db, repositoryId);
      const hasRoot = workspaces.some((ws) => ws.checkout_type === "root");
      if (!hasRoot) {
        await insertWorkspace(db, {
          repositoryId,
          name: body.rootWorkspace.name,
          sourceRef: body.rootWorkspace.sourceRef,
          workspaceRoot: body.rootWorkspace.workspaceRoot,
          host: "local",
          checkoutType: "root",
          preparedAt: new Date().toISOString(),
        });
      }
    }

    ctx.status(existing ? 200 : 201);
    return { id: repositoryId, created: !existing };
  },
});

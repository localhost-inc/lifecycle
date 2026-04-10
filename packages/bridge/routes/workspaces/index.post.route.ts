import { createRoute } from "routedjs";
import { z } from "zod";
import { WorkspaceHostSchema, WorkspaceRecordSchema } from "@lifecycle/contracts";
import { createWorkspace } from "../../src/domains/workspace/provision";

const BridgeWorkspaceCreateResponseSchema = z
  .object({
    id: WorkspaceRecordSchema.shape.id,
    repositoryId: WorkspaceRecordSchema.shape.repository_id,
    host: WorkspaceRecordSchema.shape.host,
    name: WorkspaceRecordSchema.shape.name,
    sourceRef: WorkspaceRecordSchema.shape.source_ref,
    workspaceRoot: WorkspaceRecordSchema.shape.workspace_root.optional(),
  })
  .meta({ id: "BridgeWorkspaceCreateResponse" });

export default createRoute({
  schemas: {
    body: z.object({
      repoPath: z.string().min(1),
      name: z.string().min(1),
      sourceRef: z.string().min(1).optional(),
      host: WorkspaceHostSchema.default("local"),
    }),
    responses: {
      201: BridgeWorkspaceCreateResponseSchema,
    },
  },
  handler: async ({ body, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const createdWorkspace = await createWorkspace(db, workspaceRegistry, {
      repoPath: body.repoPath,
      name: body.name,
      host: body.host,
      ...(body.sourceRef ? { sourceRef: body.sourceRef } : {}),
    });

    ctx.status(201);
    return createdWorkspace;
  },
});

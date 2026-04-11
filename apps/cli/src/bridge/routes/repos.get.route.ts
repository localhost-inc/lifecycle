import { createRoute } from "routedjs";
import { z } from "zod";
import { RepositoryRecordSchema, WorkspaceRecordSchema } from "@lifecycle/contracts";
import { isMissingLifecycleSchemaError } from "@lifecycle/db";
import { listRepositoriesWithWorkspaces } from "@lifecycle/db/queries";

const BridgeRepositoryWorkspaceSummarySchema = WorkspaceRecordSchema.pick({
  id: true,
  name: true,
  slug: true,
  host: true,
  status: true,
})
  .extend({
    ref: z.string().optional(),
    path: z.string().optional(),
  })
  .meta({ id: "BridgeRepositoryWorkspaceSummary" });

const BridgeRepositorySummarySchema = RepositoryRecordSchema.pick({
  id: true,
  name: true,
  slug: true,
  path: true,
})
  .extend({
    source: z.literal("local"),
    workspaces: z.array(BridgeRepositoryWorkspaceSummarySchema),
  })
  .meta({ id: "BridgeRepositorySummary" });

const BridgeRepositoriesResponseSchema = z
  .object({
    repositories: z.array(BridgeRepositorySummarySchema),
  })
  .meta({ id: "BridgeRepositoriesResponse" });

export default createRoute({
  schemas: {
    responses: {
      200: BridgeRepositoriesResponseSchema,
    },
  },
  handler: async ({ ctx }) => {
    const db = ctx.get("db");
    const rows = await listRepositoriesWithWorkspaces(db).catch((error) => {
      if (isMissingLifecycleSchemaError(error)) {
        return [];
      }
      throw error;
    });

    return {
      repositories: rows.map((repo) => ({
        id: repo.id,
        name: repo.name,
        slug: repo.slug,
        source: "local" as const,
        path: repo.path,
        workspaces: repo.workspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          host: ws.host,
          status: ws.status,
          ...(ws.source_ref ? { ref: ws.source_ref } : {}),
          ...(ws.workspace_root ? { path: ws.workspace_root } : {}),
        })),
      })),
    };
  },
});

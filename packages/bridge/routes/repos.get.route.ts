import { createRoute } from "routedjs";
import { isMissingLifecycleSchemaError } from "@lifecycle/db";
import { listRepositoriesWithWorkspaces } from "@lifecycle/db/queries";

export default createRoute({
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

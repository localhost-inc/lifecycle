import { createRoute } from "routedjs";
import { z } from "zod";

import { InstallDocumentScopeSchema, InstallInspectionSchema } from "../domains/install/schema";
import { inspectLifecycleInstall } from "../domains/install/service";

export default createRoute({
  schemas: {
    query: z.object({
      document_scope: InstallDocumentScopeSchema.optional(),
      path: z.string().min(1).optional(),
    }),
    responses: {
      200: InstallInspectionSchema,
    },
  },
  handler: async ({ query }) =>
    await inspectLifecycleInstall({
      ...(query.document_scope ? { documentScope: query.document_scope } : {}),
      ...(query.path ? { repoPath: query.path } : {}),
    }),
});

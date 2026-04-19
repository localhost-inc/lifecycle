import { createRoute } from "routedjs";
import { z } from "zod";

import {
  InstallApplyResponseSchema,
  InstallDocumentScopeSchema,
  InstallStepIdSchema,
} from "../../domains/install/schema";
import { applyLifecycleInstall } from "../../domains/install/service";

export default createRoute({
  schemas: {
    body: z.object({
      document_scope: InstallDocumentScopeSchema.optional(),
      path: z.string().min(1).optional(),
      step_ids: z.array(InstallStepIdSchema),
    }),
    responses: {
      200: InstallApplyResponseSchema,
    },
  },
  handler: async ({ body }) =>
    await applyLifecycleInstall({
      ...(body.document_scope ? { documentScope: body.document_scope } : {}),
      ...(body.path ? { repoPath: body.path } : {}),
      stepIds: body.step_ids,
    }),
});

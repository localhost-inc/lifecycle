import { createRoute } from "routedjs";
import { z } from "zod";
import { WorkspaceRecordSchema } from "@lifecycle/contracts";

import { resolveWorkspaceRecord } from "../../domains/workspace/resolve";
import { listWorkspaceStack } from "../../domains/stack/service";
import { WorkspaceStackSummarySchema } from "../schemas";

const BridgeWorkspaceDetailResponseSchema = z
  .object({
    stack: WorkspaceStackSummarySchema,
    workspace: WorkspaceRecordSchema,
  })
  .meta({ id: "BridgeWorkspaceDetailResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceDetailResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return {
      stack: await listWorkspaceStack(db, workspaceRegistry, params.id),
      workspace: await resolveWorkspaceRecord(db, params.id),
    };
  },
});

import { createRoute } from "routedjs";
import { z } from "zod";
import { ServiceStatusReasonSchema, ServiceStatusSchema } from "@lifecycle/contracts";

import { startWorkspaceStack } from "../../../../src/domains/stack/service";

const WorkspaceStackNodeSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        workspace_id: z.string(),
        name: z.string(),
        depends_on: z.array(z.string()),
        kind: z.literal("service"),
        runtime: z.enum(["process", "image"]).meta({ id: "WorkspaceStackServiceRuntime" }),
        status: ServiceStatusSchema,
        status_reason: ServiceStatusReasonSchema.nullable(),
        assigned_port: z.number().int().nullable(),
        preview_url: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
      })
      .meta({ id: "WorkspaceStackServiceNode" }),
    z
      .object({
        workspace_id: z.string(),
        name: z.string(),
        depends_on: z.array(z.string()),
        kind: z.literal("task"),
        run_on: z.enum(["create", "start"]).nullable().meta({ id: "WorkspaceStackTaskRunOn" }),
        command: z.string().nullable(),
        write_files_count: z.number().int(),
      })
      .meta({ id: "WorkspaceStackTaskNode" }),
  ])
  .meta({ id: "WorkspaceStackNode" });
const BridgeWorkspaceStackMutationResponseSchema = z
  .object({
    stack: z
      .object({
        workspace_id: z.string(),
        state: z.enum(["ready", "missing", "invalid"]).meta({ id: "WorkspaceStackState" }),
        errors: z.array(z.string()),
        nodes: z.array(WorkspaceStackNodeSchema),
      })
      .meta({ id: "WorkspaceStackSummary" }),
    workspaceId: z.string(),
    startedServices: z.array(z.string()).optional(),
    stoppedServices: z.array(z.string()).optional(),
  })
  .meta({ id: "BridgeWorkspaceStackMutationResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      serviceNames: z.array(z.string().min(1)).optional(),
    }),
    responses: {
      200: BridgeWorkspaceStackMutationResponseSchema,
    },
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return startWorkspaceStack(db, workspaceRegistry, params.id, body.serviceNames);
  },
});

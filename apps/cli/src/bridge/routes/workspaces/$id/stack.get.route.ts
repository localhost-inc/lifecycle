import { createRoute } from "routedjs";
import { z } from "zod";
import { ServiceStatusReasonSchema, ServiceStatusSchema } from "@lifecycle/contracts";

import { listWorkspaceStack } from "../../../domains/stack/service";

const WorkspaceStackNodeSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        workspace_id: z.string(),
        name: z.string(),
        depends_on: z.array(z.string()),
        kind: z.literal("process"),
        status: ServiceStatusSchema,
        status_reason: ServiceStatusReasonSchema.nullable(),
        assigned_port: z.number().int().nullable(),
        preview_url: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
      })
      .meta({ id: "WorkspaceStackProcessNode" }),
    z
      .object({
        workspace_id: z.string(),
        name: z.string(),
        depends_on: z.array(z.string()),
        kind: z.literal("image"),
        status: ServiceStatusSchema,
        status_reason: ServiceStatusReasonSchema.nullable(),
        assigned_port: z.number().int().nullable(),
        preview_url: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
      })
      .meta({ id: "WorkspaceStackImageNode" }),
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
const BridgeWorkspaceStackResponseSchema = z
  .object({
    stack: z
      .object({
        workspace_id: z.string(),
        state: z
          .enum(["ready", "missing", "invalid", "unconfigured"])
          .meta({ id: "WorkspaceStackState" }),
        errors: z.array(z.string()),
        nodes: z.array(WorkspaceStackNodeSchema),
      })
      .meta({ id: "WorkspaceStackSummary" }),
  })
  .meta({ id: "BridgeWorkspaceStackResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceStackResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return { stack: await listWorkspaceStack(db, workspaceRegistry, params.id) };
  },
});

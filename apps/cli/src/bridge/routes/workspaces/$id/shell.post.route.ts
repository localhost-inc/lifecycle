import { createRoute } from "routedjs";
import { z } from "zod";
import { readWorkspaceShell } from "../../../domains/terminal/service";
import { BridgeShellLaunchSpecSchema, BridgeWorkspaceScopeSchema } from "../../schemas";

const BridgeWorkspaceShellRuntimeSchema = z
  .object({
    backend_label: z.string(),
    launch_error: z.string().nullable(),
    persistent: z.boolean(),
    session_name: z.string().nullable(),
    prepare: BridgeShellLaunchSpecSchema.nullable(),
    spec: BridgeShellLaunchSpecSchema.nullable(),
  })
  .meta({ id: "BridgeWorkspaceShellRuntime" });

const BridgeWorkspaceShellEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    shell: BridgeWorkspaceShellRuntimeSchema,
  })
  .meta({ id: "BridgeWorkspaceShellEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    responses: {
      200: BridgeWorkspaceShellEnvelopeSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await readWorkspaceShell(db, workspaceRegistry, params.id);
  },
});

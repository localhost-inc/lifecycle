import { createRoute } from "routedjs";
import { z } from "zod";
import { listWorkspaceTerminals } from "../../../domains/terminal/service";
import {
  BridgeWorkspaceScopeSchema,
  BridgeWorkspaceTerminalRecordSchema,
  BridgeWorkspaceTerminalRuntimeSchema,
} from "../../schemas";

const BridgeWorkspaceTerminalsEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    runtime: BridgeWorkspaceTerminalRuntimeSchema,
    terminals: z.array(BridgeWorkspaceTerminalRecordSchema),
  })
  .meta({ id: "BridgeWorkspaceTerminalsEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    responses: {
      200: BridgeWorkspaceTerminalsEnvelopeSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await listWorkspaceTerminals(db, workspaceRegistry, params.id);
  },
});

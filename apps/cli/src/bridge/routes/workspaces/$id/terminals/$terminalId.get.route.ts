import { createRoute } from "routedjs";
import { z } from "zod";
import { readWorkspaceTerminal } from "../../../../domains/terminal/service";
import {
  BridgeErrorEnvelopeSchema,
  BridgeWorkspaceScopeSchema,
  BridgeWorkspaceTerminalRecordSchema,
  BridgeWorkspaceTerminalRuntimeSchema,
} from "../../../schemas";
const BridgeWorkspaceTerminalEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    runtime: BridgeWorkspaceTerminalRuntimeSchema,
    terminal: BridgeWorkspaceTerminalRecordSchema.nullable(),
  })
  .meta({ id: "BridgeWorkspaceTerminalEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceTerminalEnvelopeSchema,
      404: BridgeErrorEnvelopeSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const response = await readWorkspaceTerminal(
      db,
      workspaceRegistry,
      params.id,
      params.terminalId,
    );
    if (!response.terminal) {
      ctx.status(404);
      return {
        error: {
          code: "not_found",
          message: `Could not resolve terminal "${params.terminalId}" in workspace "${params.id}".`,
        },
      };
    }

    return response;
  },
});

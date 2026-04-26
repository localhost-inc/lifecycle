import { createRoute } from "routedjs";
import { z } from "zod";
import { closeWorkspaceTerminal } from "../../../../domains/terminal/service";
import { BridgeWorkspaceScopeSchema } from "../../../schemas";

const BridgeWorkspaceTerminalCloseResponseSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    terminal_id: z.string(),
    closed: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalCloseResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceTerminalCloseResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const [{ broadcastMessage }, { buildWorkspaceSnapshotInvalidatedMessage, workspaceTopic }] =
      await Promise.all([
        import("../../../../lib/server"),
        import("../../../../lib/socket-topics"),
      ]);
    const response = await closeWorkspaceTerminal(
      db,
      workspaceRegistry,
      params.id,
      params.terminalId,
    );
    broadcastMessage(
      buildWorkspaceSnapshotInvalidatedMessage({
        reason: "terminal.closed",
        workspaceId: params.id,
      }),
      workspaceTopic(params.id),
    );
    return response;
  },
});

import { createRoute } from "routedjs";
import { z } from "zod";
import { createWorkspaceTerminal } from "../../../domains/terminal/service";
import {
  BridgeWorkspaceScopeSchema,
  BridgeWorkspaceTerminalRecordSchema,
  BridgeWorkspaceTerminalRuntimeSchema,
} from "../../schemas";

const BridgeTerminalKindSchema = z
  .enum(["shell", "claude", "codex", "opencode", "custom"])
  .meta({ id: "BridgeTerminalKind" });
const BridgeWorkspaceCreatedTerminalEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    runtime: BridgeWorkspaceTerminalRuntimeSchema,
    terminal: BridgeWorkspaceTerminalRecordSchema,
  })
  .meta({ id: "BridgeWorkspaceCreatedTerminalEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      kind: BridgeTerminalKindSchema.optional(),
      title: z.string().trim().min(1).nullable().optional(),
    }),
    responses: {
      201: BridgeWorkspaceCreatedTerminalEnvelopeSchema,
    },
  },
  handler: async ({ body, params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const [{ broadcastMessage }, { buildWorkspaceSnapshotInvalidatedMessage, workspaceTopic }] =
      await Promise.all([import("../../../lib/server"), import("../../../lib/socket-topics")]);
    const response = await createWorkspaceTerminal(db, workspaceRegistry, params.id, {
      ...(body.kind ? { kind: body.kind } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
    });
    broadcastMessage(
      buildWorkspaceSnapshotInvalidatedMessage({
        reason: "terminal.created",
        workspaceId: params.id,
      }),
      workspaceTopic(params.id),
    );
    ctx.status(201);
    return response;
  },
});

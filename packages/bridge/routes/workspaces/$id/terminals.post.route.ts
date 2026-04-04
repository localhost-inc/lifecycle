import { createRoute } from "routedjs";
import { z } from "zod";
import { createBridgeTerminal } from "../../../src/workspaces";

const terminalKindSchema = z.enum(["shell", "claude", "codex", "custom"]);

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      kind: terminalKindSchema.optional(),
      title: z.string().trim().min(1).nullable().optional(),
    }),
  },
  handler: async ({ body, params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    ctx.status(201);
    return await createBridgeTerminal(db, workspaceRegistry, params.id, {
      ...(body.kind ? { kind: body.kind } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
    });
  },
});

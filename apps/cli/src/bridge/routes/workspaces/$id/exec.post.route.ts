import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../../domains/auth/control-plane";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      command: z.array(z.string()).min(1),
      cwd: z.string().trim().min(1).optional(),
      env: z.record(z.string(), z.string()).optional(),
      timeoutSeconds: z.number().int().min(1).max(300).optional(),
    }),
  },
  handler: async ({ params, body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.workspaces[":workspaceId"].exec.$post({
      param: { workspaceId: params.id },
      json: {
        command: body.command,
        ...(body.cwd ? { cwd: body.cwd } : {}),
        ...(body.env ? { env: body.env } : {}),
        ...(body.timeoutSeconds !== undefined ? { timeoutSeconds: body.timeoutSeconds } : {}),
      },
    });

    return await readControlPlaneJson(response);
  },
});

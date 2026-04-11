import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "List workspaces for the active organization.",
  input: z.object({
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const { client } = await ensureBridge();
      const response = await client.workspaces.$get({ query: {} });
      const { workspaces } = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify({ workspaces }, null, 2));
        return 0;
      }

      if (workspaces.length === 0) {
        context.stdout("No workspaces. Run `lifecycle workspace create` to create one.");
        return 0;
      }

      for (const ws of workspaces) {
        context.stdout(`${ws.slug ?? ws.name} (${ws.status}) — ${ws.sourceRef}`);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});

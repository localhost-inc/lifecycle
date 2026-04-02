import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { readCredentials, requireActiveOrg } from "../../credentials";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "List workspaces for the active organization.",
  input: z.object({
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const credentials = await readCredentials();
      if (!credentials) {
        context.stderr("Not signed in. Run `lifecycle auth login` first.");
        return 1;
      }

      const orgId = requireActiveOrg(credentials);
      const client = createClient();
      const res = await client.workspaces.$get({ query: { organizationId: orgId } });
      const { workspaces } = await res.json();

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

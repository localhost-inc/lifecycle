import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "List repositories.",
  input: z.object({
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const { client } = await ensureBridge();
      const res = await client.repos.$get();
      const { repositories } = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify({ repositories }, null, 2));
        return 0;
      }

      if (repositories.length === 0) {
        context.stdout("No repositories. Run `lifecycle repo init` in a project directory to add one.");
        return 0;
      }

      for (const repo of repositories) {
        context.stdout(`${repo.name} (${repo.source}) ${repo.path ?? ""}`);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});

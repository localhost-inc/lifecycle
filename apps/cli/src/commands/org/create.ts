import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Create a new organization.",
  input: z.object({
    args: z.array(z.string()).describe("<name>"),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const name = input.args[0];
      if (!name) {
        context.stderr("Usage: lifecycle org create <name>");
        return 1;
      }

      const { client } = await ensureBridge();
      const res = await client.organizations.$post({ json: { name } });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`Organization "${result.name}" created.`);
      context.stdout(`slug: ${result.slug}`);
      context.stdout(`id: ${result.id}`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});

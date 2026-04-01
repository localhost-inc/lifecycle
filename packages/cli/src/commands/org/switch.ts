import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { readCredentials, updateCredentials } from "../../credentials";
import { BridgeClientError } from "../../errors";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Switch the active organization.",
  input: z.object({
    args: z.array(z.string()).describe("<name|id>"),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const target = input.args[0];
      if (!target) {
        context.stderr("Usage: lifecycle org switch <name|id>");
        return 1;
      }

      const credentials = await readCredentials();
      if (!credentials) {
        throw new BridgeClientError({
          code: "unauthenticated",
          message: "Not signed in.",
          suggestedAction: "Run `lifecycle auth login` to sign in.",
        });
      }

      const client = createClient();
      const res = await client.organizations.$get();
      const { organizations } = await res.json();

      // Match by slug, name, or id
      const match = organizations.find(
        (org) =>
          org.slug === target ||
          org.name.toLowerCase() === target.toLowerCase() ||
          org.id === target,
      );

      if (!match) {
        throw new BridgeClientError({
          code: "organization_not_found",
          message: `Organization "${target}" not found.`,
          suggestedAction:
            "Run `lifecycle org create <name>` to create one, or check your membership.",
        });
      }

      await updateCredentials({
        activeOrgId: match.id,
        activeOrgSlug: match.slug,
      });

      if (input.json) {
        context.stdout(JSON.stringify(match, null, 2));
        return 0;
      }

      context.stdout(`Switched to organization "${match.name}" (${match.slug}).`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});

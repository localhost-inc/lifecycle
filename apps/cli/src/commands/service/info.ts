import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import {
  failCommand,
  failValidation,
  jsonFlag,
  printServiceSummary,
  resolveWorkspaceId,
  stackServices,
  workspaceIdFlag,
} from "../_shared";

function validateServiceInfoInput(input: { args: string[] }): string | null {
  if (input.args.length !== 1) {
    return "lifecycle service info requires exactly one <service> argument.";
  }

  return null;
}

export default defineCommand({
  description: "Show runtime status for a service in the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Service name to inspect."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    const validationError = validateServiceInfoInput(input);
    if (validationError) {
      return failValidation(validationError, {
        json: input.json,
        stderr: context.stderr,
      });
    }

    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].stack.$get({
        param: { id: workspaceId },
      });
      const result = await response.json();
      const service = stackServices(result.stack).find((entry) => entry.name === (input.args[0] ?? ""));
      if (!service) {
        throw new Error(`Service "${input.args[0]}" was not found in workspace ${workspaceId}.`);
      }

      if (input.json) {
        context.stdout(JSON.stringify(service, null, 2));
        return 0;
      }

      printServiceSummary(service, context.stdout);
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});

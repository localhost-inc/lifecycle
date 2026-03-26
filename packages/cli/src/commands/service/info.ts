import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createServiceInfoRequest, requestBridge, resolveWorkspaceId } from "../../bridge";
import {
  failCommand,
  failValidation,
  jsonFlag,
  printServiceSummary,
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
      const response = await requestBridge(
        createServiceInfoRequest({
          service: input.args[0] ?? "",
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result.service, null, 2));
        return 0;
      }

      printServiceSummary(response.result.service, context.stdout);
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});

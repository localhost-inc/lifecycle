import { defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

function validateServiceLogsInput(input: { args: string[] }): string | null {
  if (input.args.length !== 1) {
    return "lifecycle service logs requires exactly one <service> argument.";
  }

  return null;
}

export default createStubCommand({
  commandName: "lifecycle service logs",
  description: "Tail logs for a service in the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Service name to inspect."),
    follow: defineFlag(z.boolean().default(false).describe("Follow log output."), {
      aliases: "f",
    }),
    grep: z.string().optional().describe("Filter log lines by a pattern."),
    json: jsonFlag,
    since: z.string().optional().describe("Only include logs newer than this duration."),
    tail: defineFlag(
      z.coerce.number().int().positive().optional().describe("Tail the last N lines."),
      {
        aliases: "t",
      },
    ),
    workspaceId: workspaceIdFlag,
  }),
  validate: validateServiceLogsInput,
});

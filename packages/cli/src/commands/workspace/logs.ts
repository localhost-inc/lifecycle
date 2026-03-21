import { defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle workspace logs",
  description: "Tail workspace service logs.",
  input: z.object({
    follow: defineFlag(z.boolean().default(false).describe("Follow log output."), {
      aliases: "f",
    }),
    grep: z.string().optional().describe("Filter log lines by a pattern."),
    json: jsonFlag,
    service: z.string().describe("Service name to inspect."),
    since: z.string().optional().describe("Only include logs newer than this duration."),
    tail: defineFlag(
      z.coerce.number().int().positive().optional().describe("Tail the last N lines."),
      {
        aliases: "t",
      },
    ),
    workspaceId: workspaceIdFlag,
  }),
});

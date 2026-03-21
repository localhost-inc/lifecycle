import { defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { createStubCommand, jsonFlag, projectIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle workspace create",
  description: "Create a workspace for a project.",
  input: z.object({
    json: jsonFlag,
    local: defineFlag(z.boolean().default(true).describe("Create a local workspace."), {
      aliases: "l",
    }),
    projectId: projectIdFlag,
    ref: z.string().optional().describe("Git ref or branch to base the workspace on."),
  }),
});

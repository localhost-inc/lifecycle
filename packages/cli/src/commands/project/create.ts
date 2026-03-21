import { z } from "zod";

import { createStubCommand, jsonFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle project create",
  description: "Create a project from a local repository path.",
  input: z.object({
    json: jsonFlag,
    name: z.string().optional().describe("Project display name."),
    path: z
      .string()
      .optional()
      .describe("Repository or project path. Defaults to the current directory when supported."),
  }),
});

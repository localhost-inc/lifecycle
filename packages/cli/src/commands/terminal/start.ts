import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle terminal start",
  description: "Start a terminal session.",
  input: z.object({
    harness: z
      .enum(["claude", "codex"])
      .optional()
      .describe("Harness provider. Omit for a plain shell terminal."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
});

import { z } from "zod";

import { createStubCommand, jsonFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle repo init",
  description: "Initialize a repo for Lifecycle.",
  input: z.object({
    json: jsonFlag,
    path: z.string().optional().describe("Repository path. Defaults to the current directory."),
  }),
});

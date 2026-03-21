import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle workspace destroy",
  description: "Destroy a workspace.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
});

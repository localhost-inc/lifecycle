import { z } from "zod";

import { createStubCommand, jsonFlag } from "./_shared";

export default createStubCommand({
  commandName: "lifecycle prepare",
  description: "Prepare the local machine for Lifecycle.",
  input: z.object({
    json: jsonFlag,
  }),
});

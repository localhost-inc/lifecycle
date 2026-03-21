import { z } from "zod";

import { createStubCommand, jsonFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle repo list",
  description: "List known repos.",
  input: z.object({
    json: jsonFlag,
  }),
});

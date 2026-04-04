import { createRoute } from "routedjs";
import { z } from "zod";
import { deleteRepository } from "@lifecycle/db/queries";

export default createRoute({
  schemas: {
    params: z.object({ repoId: z.string().min(1) }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    await deleteRepository(db, params.repoId);
    return { deleted: true };
  },
});

import { app } from "../routed.gen";
import { cors } from "hono/cors";
import { ApiError } from "./errors";

app.use("*", cors());

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return err.toResponse();
  }

  console.error("Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "internal_error",
        message: "An internal error occurred.",
        retryable: true,
      },
    },
    500,
  );
});

export { WorkspaceDO } from "./workspace-do";

export type AppType = typeof app;
export default app;

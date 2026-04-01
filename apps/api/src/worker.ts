import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { ApiError } from "./errors";
import { dbMiddleware } from "./middleware/db";
import { authMiddleware } from "./middleware/auth";
import { auth } from "./routes/auth";
import { orgs } from "./routes/orgs";
import { repos } from "./routes/repos";
import { workspaces } from "./routes/workspaces";

const app = new Hono<Env>();

// Global middleware
app.use("*", cors());
app.use("*", dbMiddleware);

// Error handler
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

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// Authenticated route middleware
app.use("/organizations/*", authMiddleware);
app.use("/repos/*", authMiddleware);
app.use("/workspaces/*", authMiddleware);

// All routes — chained for Hono RPC type inference
const routes = app
  .route("/auth", auth)
  .route("/organizations", orgs)
  .route("/repos", repos)
  .route("/workspaces", workspaces);

export type AppType = typeof routes;
export default app;

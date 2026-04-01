import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { createDb } from "../db";

export const dbMiddleware = createMiddleware<Env>(async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

import { createMiddleware } from "routedjs";
import type { Context } from "hono";
import { createDb } from "../src/db";

export default createMiddleware(async ({ ctx, next }) => {
  const c = ctx.raw as Context;
  ctx.set("db", createDb(c.env.DB));
  await next();
});

import { createMiddleware } from "routedjs";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { user } from "../../src/db/schema";
import { unauthenticated } from "../../src/errors";
import { verifyAccessToken } from "../../src/auth";

export default createMiddleware(async ({ ctx, next }) => {
  const c = ctx.raw as Context;
  const request = ctx.request;

  const header = request.headers.get("Authorization");
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");

  const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;
  if (!token) throw unauthenticated();

  // Verify WorkOS JWT
  let workosUserId: string;
  try {
    const result = await verifyAccessToken(token, c.env.WORKOS_CLIENT_ID);
    workosUserId = result.workosUserId;
  } catch {
    throw unauthenticated("Invalid or expired token.");
  }

  // Look up internal user by WorkOS ID
  const db = ctx.get("db");
  const rows = await db.select().from(user).where(eq(user.workosUserId, workosUserId)).limit(1);
  if (rows.length === 0) throw unauthenticated("User not found.");

  ctx.set("userId", rows[0]!.id);
  await next();
});

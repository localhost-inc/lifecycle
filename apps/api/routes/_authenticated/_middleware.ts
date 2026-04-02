import { createMiddleware } from "routedjs";
import { eq } from "drizzle-orm";
import { user } from "../../src/db/schema";
import { unauthenticated } from "../../src/errors";

export default createMiddleware(async ({ ctx, next }) => {
  const request = ctx.request;
  const header = request.headers.get("Authorization");
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");

  const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;
  if (!token) throw unauthenticated();

  let userId: string;
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (!parts[0]) throw new Error();
    userId = parts[0];
  } catch {
    throw unauthenticated("Invalid token.");
  }

  const db = ctx.get("db");
  const rows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (rows.length === 0) throw unauthenticated("User not found for this token.");

  ctx.set("userId", userId);
  await next();
});

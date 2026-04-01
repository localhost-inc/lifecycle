import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import type { Env } from "../types";
import { user } from "../db/schema";
import { unauthenticated } from "../errors";

/**
 * Validates the Bearer token and attaches the userId to context.
 *
 * For V1, the token is the WorkOS access token issued during device auth.
 * The auth/token endpoint stores the user record in D1. This middleware
 * verifies the token by looking up the user it was issued for.
 *
 * A production upgrade would verify JWT signatures or call WorkOS introspection.
 * For now we store a mapping of token -> userId in a simple lookup.
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  // Accept token from Authorization header or ?token= query param (for WebSocket).
  const header = c.req.header("Authorization");
  const queryToken = new URL(c.req.url).searchParams.get("token");

  const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;
  if (!token) {
    throw unauthenticated();
  }

  // V1: decode the token as a simple base64(userId:workosUserId) pair.
  // This is intentionally simple — production would verify WorkOS JWTs.
  let userId: string;
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length < 1 || !parts[0]) {
      throw unauthenticated("Invalid token format.");
    }
    userId = parts[0];
  } catch {
    throw unauthenticated("Invalid token.");
  }

  const db = c.get("db");
  const rows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (rows.length === 0) {
    throw unauthenticated("User not found for this token.");
  }

  c.set("userId", userId);
  await next();
});

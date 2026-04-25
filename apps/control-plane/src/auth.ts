import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// ── Types ───────────────────────────────────────────────────────────────────

export interface VerifyTokenResult {
  /** WorkOS user ID (`sub` claim). */
  workosUserId: string;
  /** WorkOS organization ID if present. */
  workosOrgId: string | null;
  /** Organization role from JWT claims. */
  role: string | null;
  /** Permissions array from JWT claims. */
  permissions: string[];
  /** Session ID from JWT claims. */
  sessionId: string | null;
  /** Raw JWT payload. */
  claims: JWTPayload;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

// ── JWKS cache ──────────────────────────────────────────────────────────────

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(clientId: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(clientId);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
    jwksCache.set(clientId, jwks);
  }
  return jwks;
}

// ── Verify ──────────────────────────────────────────────────────────────────

/**
 * Verify a WorkOS access token JWT.
 *
 * Returns decoded claims on success. Throws on invalid/expired tokens.
 */
export async function verifyAccessToken(
  token: string,
  clientId: string,
): Promise<VerifyTokenResult> {
  const jwks = getJWKS(clientId);

  const { payload } = await jwtVerify(token, jwks, {
    issuer: "https://api.workos.com",
    audience: clientId,
  });

  const workosUserId = payload.sub;
  if (!workosUserId) {
    throw new Error("JWT missing sub claim.");
  }

  return {
    workosUserId,
    workosOrgId: (payload.org_id as string) ?? null,
    role: (payload.role as string) ?? null,
    permissions: (payload.permissions as string[]) ?? [],
    sessionId: (payload.sid as string) ?? null,
    claims: payload,
  };
}

// ── Token refresh ───────────────────────────────────────────────────────────

/**
 * Exchange a refresh token for a new access/refresh token pair via WorkOS.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  apiKey: string,
): Promise<RefreshResult> {
  const response = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: apiKey,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

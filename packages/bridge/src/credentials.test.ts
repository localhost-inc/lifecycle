import { describe, expect, test } from "bun:test";

import { resolveStoredAccessToken, type StoredCredentials } from "./credentials";

function credentials(overrides: Partial<StoredCredentials> = {}): StoredCredentials {
  return {
    token: "fallback-token",
    accessToken: null,
    refreshToken: "refresh-token",
    userId: "user_123",
    email: "kyle@example.com",
    displayName: "Kyle",
    activeOrgId: "org_123",
    activeOrgSlug: "kin",
    ...overrides,
  };
}

describe("resolveStoredAccessToken", () => {
  test("prefers accessToken when present", () => {
    expect(
      resolveStoredAccessToken(
        credentials({
          token: "legacy-token",
          accessToken: "jwt-access-token",
        }),
      ),
    ).toBe("jwt-access-token");
  });

  test("falls back to token when accessToken is absent", () => {
    expect(
      resolveStoredAccessToken(
        credentials({
          token: "jwt-access-token",
          accessToken: null,
        }),
      ),
    ).toBe("jwt-access-token");
  });

  test("returns null when neither token field has a value", () => {
    expect(
      resolveStoredAccessToken(
        credentials({
          token: "",
          accessToken: "   ",
        }),
      ),
    ).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import { codexProviderAuthStatusFromAccountRead } from "./providers/codex/auth";

describe("codex provider auth status mapping", () => {
  test("treats ChatGPT account auth as authenticated", () => {
    expect(
      codexProviderAuthStatusFromAccountRead({
        account: {
          email: "user@example.com",
          planType: "plus",
          type: "chatgpt",
        },
        requiresOpenaiAuth: true,
      }),
    ).toEqual({
      state: "authenticated",
      email: "user@example.com",
      organization: "plus",
    });
  });

  test("treats API key auth as authenticated", () => {
    expect(
      codexProviderAuthStatusFromAccountRead({
        account: {
          type: "apiKey",
        },
        requiresOpenaiAuth: true,
      }),
    ).toEqual({
      state: "authenticated",
      email: null,
      organization: "API key",
    });
  });

  test("treats auth-optional runtimes as authenticated", () => {
    expect(
      codexProviderAuthStatusFromAccountRead({
        account: null,
        requiresOpenaiAuth: false,
      }),
    ).toEqual({
      state: "authenticated",
      email: null,
      organization: null,
    });
  });

  test("treats missing required auth as unauthenticated", () => {
    expect(
      codexProviderAuthStatusFromAccountRead({
        account: null,
        requiresOpenaiAuth: true,
      }),
    ).toEqual({
      state: "unauthenticated",
    });
  });
});

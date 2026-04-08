import { describe, expect, test } from "bun:test";
import type { AgentAuthStatus } from "@lifecycle/agents";
import { BridgeError } from "./errors";
import { loginBridgeProviderAuth, readBridgeProviderAuth } from "./provider-auth";

describe("bridge provider auth", () => {
  test("reads provider auth status through the direct agent auth helpers", async () => {
    const result = await readBridgeProviderAuth("codex", {
      checkAgentProviderAuth: async (provider) => {
        expect(provider).toBe("codex");
        return {
          state: "authenticated",
          email: "user@example.com",
          organization: "plus",
        } satisfies AgentAuthStatus;
      },
      loginAgentProviderAuth: async () => {
        throw new Error("login should not be called");
      },
    });

    expect(result).toEqual({
      provider: "codex",
      status: {
        state: "authenticated",
        email: "user@example.com",
        organization: "plus",
      },
    });
  });

  test("passes Claude login method through bridge login", async () => {
    const result = await loginBridgeProviderAuth(
      {
        provider: "claude",
        loginMethod: "console",
      },
      {
        checkAgentProviderAuth: async () => {
          throw new Error("status should not be called");
        },
        loginAgentProviderAuth: async (provider, _onStatus, options) => {
          expect(provider).toBe("claude");
          expect(options).toEqual({ loginMethod: "console" });
          return {
            state: "authenticated",
            email: null,
            organization: "console",
          } satisfies AgentAuthStatus;
        },
      },
    );

    expect(result).toEqual({
      provider: "claude",
      status: {
        state: "authenticated",
        email: null,
        organization: "console",
      },
    });
  });

  test("rejects login method overrides for non-Claude providers", async () => {
    await expect(
      loginBridgeProviderAuth(
        {
          provider: "codex",
          loginMethod: "console",
        },
        {
          checkAgentProviderAuth: async () => ({ state: "unauthenticated" }),
          loginAgentProviderAuth: async () => ({ state: "unauthenticated" }),
        },
      ),
    ).rejects.toBeInstanceOf(BridgeError);
  });
});

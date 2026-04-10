import { describe, expect, test } from "bun:test";
import type { AgentAuthStatus } from "@lifecycle/agents";
import { BridgeError } from "../../../lib/errors";
import { loginBridgeProviderAuth, readBridgeProviderAuth } from "./provider-auth";

const defaultBridgeSettings = {
  appearance: { theme: "dark" as const },
  providers: {
    claude: {
      loginMethod: "claudeai" as const,
    },
  },
  terminal: {
    command: { program: null },
    persistence: {
      backend: "tmux" as const,
      mode: "managed" as const,
      executablePath: null,
    },
    defaultProfile: "shell",
    profiles: {
      shell: {
        launcher: "shell" as const,
        label: "Shell",
      },
      claude: {
        launcher: "claude" as const,
        label: "Claude",
        settings: {
          model: null,
          permissionMode: null,
          effort: null,
        },
      },
      codex: {
        launcher: "codex" as const,
        label: "Codex",
        settings: {
          model: null,
          configProfile: null,
          approvalPolicy: null,
          sandboxMode: null,
          reasoningEffort: null,
          webSearch: null,
        },
      },
    },
  },
};

describe("bridge provider auth", () => {
  test("reads provider auth status through the direct agent auth helpers", async () => {
    const result = await readBridgeProviderAuth("codex", undefined, {
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
      readBridgeSettings: async () => ({
        settings: {
          ...defaultBridgeSettings,
        },
      }),
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
      undefined,
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
        readBridgeSettings: async () => ({
          settings: {
            ...defaultBridgeSettings,
          },
        }),
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
        undefined,
        {
          checkAgentProviderAuth: async () => ({ state: "unauthenticated" }),
          loginAgentProviderAuth: async () => ({ state: "unauthenticated" }),
          readBridgeSettings: async () => ({
            settings: {
              ...defaultBridgeSettings,
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(BridgeError);
  });

  test("uses the configured Claude login method for bridge auth checks", async () => {
    const result = await readBridgeProviderAuth("claude", undefined, {
      checkAgentProviderAuth: async (provider, options) => {
        expect(provider).toBe("claude");
        expect(options).toEqual({ loginMethod: "console" });
        return {
          state: "unauthenticated",
        } satisfies AgentAuthStatus;
      },
      loginAgentProviderAuth: async () => {
        throw new Error("login should not be called");
      },
      readBridgeSettings: async () => ({
        settings: {
          ...defaultBridgeSettings,
          providers: {
            claude: {
              loginMethod: "console",
            },
          },
        },
      }),
    });

    expect(result).toEqual({
      provider: "claude",
      status: {
        state: "unauthenticated",
      },
    });
  });
});

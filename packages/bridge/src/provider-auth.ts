import {
  checkAgentProviderAuth,
  loginAgentProviderAuth,
  type AgentProviderAuthOptions,
  type AgentAuthStatus,
  type ClaudeLoginMethod,
} from "@lifecycle/agents";
import type { AgentProviderId } from "@lifecycle/contracts";
import { BridgeError } from "./errors";

export interface BridgeProviderAuthEnvelope {
  provider: AgentProviderId;
  status: AgentAuthStatus;
}

interface BridgeProviderAuthDependencies {
  checkAgentProviderAuth: (provider: AgentProviderId) => Promise<AgentAuthStatus>;
  loginAgentProviderAuth: (
    provider: AgentProviderId,
    onStatus?: (status: Extract<AgentAuthStatus, { state: "authenticating" }>) => void,
    options?: AgentProviderAuthOptions,
  ) => Promise<AgentAuthStatus>;
}

const defaultDependencies: BridgeProviderAuthDependencies = {
  checkAgentProviderAuth,
  loginAgentProviderAuth,
};

export async function readBridgeProviderAuth(
  provider: AgentProviderId,
  dependencies: BridgeProviderAuthDependencies = defaultDependencies,
): Promise<BridgeProviderAuthEnvelope> {
  return {
    provider,
    status: await dependencies.checkAgentProviderAuth(provider),
  };
}

export async function loginBridgeProviderAuth(
  input: {
    provider: AgentProviderId;
    loginMethod?: ClaudeLoginMethod;
  },
  dependencies: BridgeProviderAuthDependencies = defaultDependencies,
): Promise<BridgeProviderAuthEnvelope> {
  if (input.provider !== "claude" && input.loginMethod !== undefined) {
    throw new BridgeError({
      code: "invalid_provider_auth_options",
      message: "Only Claude accepts a login method override.",
      status: 422,
    });
  }

  return {
    provider: input.provider,
    status: await dependencies.loginAgentProviderAuth(
      input.provider,
      undefined,
      input.provider === "claude" && input.loginMethod
        ? { loginMethod: input.loginMethod }
        : undefined,
    ),
  };
}

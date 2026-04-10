import {
  checkAgentProviderAuth,
  loginAgentProviderAuth,
  type AgentProviderAuthOptions,
  type AgentAuthStatus,
  type ClaudeLoginMethod,
} from "@lifecycle/agents";
import type { AgentProviderId } from "@lifecycle/contracts";
import { readBridgeSettings } from "../../auth/settings";
import { BridgeError } from "../../../lib/errors";

export interface BridgeProviderAuthEnvelope {
  provider: AgentProviderId;
  status: AgentAuthStatus;
}

interface BridgeProviderAuthDependencies {
  checkAgentProviderAuth: (
    provider: AgentProviderId,
    options?: AgentProviderAuthOptions,
  ) => Promise<AgentAuthStatus>;
  loginAgentProviderAuth: (
    provider: AgentProviderId,
    onStatus?: (status: Extract<AgentAuthStatus, { state: "authenticating" }>) => void,
    options?: AgentProviderAuthOptions,
  ) => Promise<AgentAuthStatus>;
  readBridgeSettings: (environment?: NodeJS.ProcessEnv) => Promise<{
    settings: {
      providers: {
        claude: {
          loginMethod: ClaudeLoginMethod;
        };
      };
    };
  }>;
}

const defaultDependencies: BridgeProviderAuthDependencies = {
  checkAgentProviderAuth,
  loginAgentProviderAuth,
  readBridgeSettings,
};

async function resolveProviderAuthOptions(
  provider: AgentProviderId,
  dependencies: BridgeProviderAuthDependencies,
  environment?: NodeJS.ProcessEnv,
): Promise<AgentProviderAuthOptions | undefined> {
  if (provider !== "claude") {
    return undefined;
  }

  const envelope = await dependencies.readBridgeSettings(environment);
  return {
    loginMethod: envelope.settings.providers.claude.loginMethod,
  };
}

export async function readBridgeProviderAuth(
  provider: AgentProviderId,
  environment?: NodeJS.ProcessEnv,
  dependencies: BridgeProviderAuthDependencies = defaultDependencies,
): Promise<BridgeProviderAuthEnvelope> {
  const options = await resolveProviderAuthOptions(provider, dependencies, environment);
  return {
    provider,
    status: await dependencies.checkAgentProviderAuth(provider, options),
  };
}

export async function loginBridgeProviderAuth(
  input: {
    provider: AgentProviderId;
    loginMethod?: ClaudeLoginMethod;
  },
  environment?: NodeJS.ProcessEnv,
  dependencies: BridgeProviderAuthDependencies = defaultDependencies,
): Promise<BridgeProviderAuthEnvelope> {
  if (input.provider !== "claude" && input.loginMethod !== undefined) {
    throw new BridgeError({
      code: "invalid_provider_auth_options",
      message: "Only Claude accepts a login method override.",
      status: 422,
    });
  }

  const configuredOptions = await resolveProviderAuthOptions(
    input.provider,
    dependencies,
    environment,
  );
  const options =
    input.provider === "claude" && input.loginMethod
      ? { loginMethod: input.loginMethod }
      : configuredOptions;

  return {
    provider: input.provider,
    status: await dependencies.loginAgentProviderAuth(input.provider, undefined, options),
  };
}

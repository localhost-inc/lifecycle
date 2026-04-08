import type { AgentProviderId } from "@lifecycle/contracts";
import type { AgentAuthStatus } from "./providers/auth";
import { checkClaudeAuthStatus, loginClaudeAuthStatus } from "./providers/claude/auth";
import type { ClaudeLoginMethod } from "./providers/claude/env";
import { checkCodexAuthStatus, loginCodexAuthStatus } from "./providers/codex/auth";

export interface AgentProviderAuthOptions {
  loginMethod?: ClaudeLoginMethod;
}

export async function checkAgentProviderAuth(
  provider: AgentProviderId,
  options?: AgentProviderAuthOptions,
): Promise<AgentAuthStatus> {
  switch (provider) {
    case "claude":
      return await checkClaudeAuthStatus(options?.loginMethod);
    case "codex":
      return await checkCodexAuthStatus();
  }
}

export async function loginAgentProviderAuth(
  provider: AgentProviderId,
  onStatus?: (status: Extract<AgentAuthStatus, { state: "authenticating" }>) => void,
  options?: AgentProviderAuthOptions,
): Promise<AgentAuthStatus> {
  switch (provider) {
    case "claude":
      return await loginClaudeAuthStatus(options?.loginMethod, onStatus);
    case "codex":
      return await loginCodexAuthStatus(onStatus);
  }
}

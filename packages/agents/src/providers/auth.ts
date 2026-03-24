import type { AgentSessionProviderId } from "@lifecycle/contracts";

export type ProviderAuthStatus =
  | { state: "not_checked" }
  | { state: "checking" }
  | { state: "authenticating"; output: string[] }
  | { state: "authenticated"; email: string | null; organization: string | null }
  | { state: "unauthenticated" }
  | { state: "error"; message: string };

export interface ProviderAuthResult {
  kind: "auth.result";
  provider: AgentSessionProviderId;
  state: ProviderAuthStatus["state"];
  email?: string | null;
  organization?: string | null;
  message?: string | null;
}

export interface ProviderAuthStatusEvent {
  kind: "auth.status";
  provider: AgentSessionProviderId;
  isAuthenticating: boolean;
  output: string[];
  error?: string;
}

export type ProviderAuthEvent = ProviderAuthResult | ProviderAuthStatusEvent;

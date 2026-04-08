import type { AgentProviderId } from "@lifecycle/contracts";

export type AgentAuthStatus =
  | { state: "not_checked" }
  | { state: "checking" }
  | { state: "authenticating"; output: string[] }
  | { state: "authenticated"; email: string | null; organization: string | null }
  | { state: "unauthenticated" }
  | { state: "error"; message: string };

export interface AgentAuthResult {
  kind: "auth.result";
  provider: AgentProviderId;
  state: AgentAuthStatus["state"];
  email?: string | null;
  organization?: string | null;
  message?: string | null;
}

export interface AgentAuthStatusEvent {
  kind: "auth.status";
  provider: AgentProviderId;
  isAuthenticating: boolean;
  output: string[];
  error?: string;
}

export type AgentAuthEvent = AgentAuthResult | AgentAuthStatusEvent;

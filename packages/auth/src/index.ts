export type AuthProviderId = "github" | "workos";
export type AuthSessionSource = "local_cli" | "cloud_session";
export type AuthSessionState = "logged_in" | "logged_out";

export interface AuthIdentity {
  avatarUrl: string | null;
  displayName: string;
  handle: string | null;
}

export interface AuthSession {
  state: AuthSessionState;
  provider: AuthProviderId | null;
  source: AuthSessionSource | null;
  identity: AuthIdentity | null;
  message: string | null;
}

export interface AuthClient {
  readSession(): Promise<AuthSession>;
}

export function buildLoggedOutAuthSession(
  overrides: Partial<Omit<AuthSession, "state">> = {},
): AuthSession {
  return {
    identity: null,
    message: null,
    provider: null,
    source: null,
    state: "logged_out",
    ...overrides,
  };
}

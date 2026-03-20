import { isTauri } from "@tauri-apps/api/core";
import { invokeTauri } from "@/lib/tauri-error";
import { buildLoggedOutAuthSession, type AuthSession } from "@/features/auth/auth-session";

const DEV_AUTH_SESSION_ENDPOINT = "/__dev/auth/session";

export async function readLocalDevAuthSession(
  fetchImpl: typeof fetch = fetch,
): Promise<AuthSession> {
  const response = await fetchImpl(DEV_AUTH_SESSION_ENDPOINT, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || "Failed to resolve local development auth session.");
  }

  return (await response.json()) as AuthSession;
}

export async function readCurrentAuthSession(): Promise<AuthSession> {
  if (import.meta.env.DEV) {
    try {
      return await readLocalDevAuthSession();
    } catch {
      if (!isTauri()) {
        return buildLoggedOutAuthSession();
      }
    }
  }

  if (isTauri()) {
    return invokeTauri<AuthSession>("get_auth_session");
  }

  return buildLoggedOutAuthSession();
}

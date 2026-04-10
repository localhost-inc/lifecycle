import { hc, type ClientResponse } from "hono/client";
import type { AppType } from "@lifecycle/control-plane/rpc";
import { resolveControlPlaneUrl } from "./control-plane-url";
import { clearCredentials, readCredentials, updateCredentials } from "./credentials";

export function createControlPlaneClient() {
  const baseUrl = resolveControlPlaneUrl();

  return hc<AppType>(baseUrl, {
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const credentials = readCredentials();
      if (!credentials?.token) {
        throw new Error("Not signed in. Run `lifecycle auth login` first.");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${credentials.token}`);
      const res = await fetch(input, { ...init, headers });

      // Auto-refresh on 401 if we have a refresh token
      if (res.status === 401 && credentials.refreshToken) {
        const newToken = await tryRefresh(baseUrl, credentials.refreshToken);
        if (newToken) {
          headers.set("Authorization", `Bearer ${newToken}`);
          return fetch(input, { ...init, headers });
        }

        clearCredentials();
      }

      return res;
    },
  });
}

async function tryRefresh(baseUrl: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { token: string; refreshToken: string };
    updateCredentials({
      token: data.token,
      accessToken: data.token,
      refreshToken: data.refreshToken,
    });
    return data.token;
  } catch {
    return null;
  }
}

type JsonResponseLike<T> = Pick<Response, "ok" | "status"> & {
  json(): Promise<T>;
};

export async function readControlPlaneJson<T>(
  response: ClientResponse<T, any, any> | JsonResponseLike<T>,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: { message?: string } }
    | null;

  if (response.ok) {
    return payload as T;
  }

  const message =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
      ? payload.error.message
      : `API error ${response.status}`;

  throw new Error(message);
}

export async function requireActiveOrganizationId(
  explicitOrganizationId?: string,
): Promise<string> {
  if (explicitOrganizationId) {
    return explicitOrganizationId;
  }

  const credentials = readCredentials();
  if (!credentials) {
    throw new Error("Not signed in. Run `lifecycle auth login` first.");
  }
  if (!credentials.activeOrgId) {
    throw new Error("No active organization. Run `lifecycle org switch <name>`.");
  }

  return credentials.activeOrgId;
}
